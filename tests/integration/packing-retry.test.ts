import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { AiTasks } from "@/server/cloudflare/ai-tasks";
import { AIError } from "@/server/ai/openai";
import type { Generator } from "@/server/planner/run";
import { makeTrip, makeUser, resetDb } from "./helpers";

vi.mock("@/server/weather/trip", () => ({
  ensureDestinationCoords: async (tripId: string) => prisma.destination.findMany({ where: { tripId } }),
  getTripWeather: async () => ({ byDate: {}, unavailable: [] }),
}));
beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

async function fixture(error: AIError, failures = 1) {
  const owner = await makeUser("Packing retry");
  const tripId = await makeTrip(owner.id);
  const plan = await prisma.generationJob.create({ data: { tripId, requestedById: owner.id, kind: "full", params: {}, status: "SUCCEEDED", appliedAt: new Date(), proposal: { days: [] } } });
  const job = await prisma.generationJob.create({ data: { tripId, requestedById: owner.id, kind: "setup", params: { planJobId: plan.id } } });
  await prisma.trip.update({ where: { id: tripId }, data: { onboardingStage: "GENERATING", onboardingJobId: job.id } });
  // Preview access is Premium in the isolated test runtime, with no production purchase.
  const values = new Map<string, unknown>();
  let alarm: number | null = null;
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => { values.set(key, structuredClone(value)); },
    delete: async (key: string) => values.delete(key),
    getAlarm: async () => alarm,
    setAlarm: async (at: number) => { alarm = at; },
    deleteAlarm: async () => { alarm = null; },
  } as unknown as DurableObjectStorage;
  let calls = 0;
  const generate = (async (opts: { name: string; metering?: { jobId?: string } }) => {
    expect(opts.name).toBe("trip_packing"); expect(opts.metering?.jobId).toBe(job.id);
    if (++calls <= failures) throw error;
    return { data: { items: [{ label: "Light layer", category: "Clothing", reason: "For this trip", shared: false, quantity: 1 }] }, model: "isolated", sources: [], usage: null };
  }) as Generator;
  const tasks = () => new AiTasks(storage, () => currentRuntime(), run => run(), generate, async () => {}, async () => false);
  return { tripId, job, values, tasks, calls: () => calls, alarm: () => alarm };
}

it("durably waits through a rate limit and finishes packing after restart without regenerating the itinerary", async () => {
  let now = Date.now(); vi.spyOn(Date, "now").mockImplementation(() => now);
  const f = await fixture(new AIError("RATE_LIMITED", "Temporary rate limit", 125_000));
  const versions = await prisma.itineraryVersion.count({ where: { tripId: f.tripId } });
  await f.tasks().alarm();
  expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: f.job.id } })).status).toBe("QUEUED");
  expect(f.alarm()).toBeGreaterThanOrEqual(now + 125_000);
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } })).onboardingStage).toBe("GENERATING");
  await f.tasks().alarm(); expect(f.calls()).toBe(1); // Early wake must not call upstream.
  now = f.alarm()! + 1; await f.tasks().alarm();
  expect(f.calls()).toBe(2);
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } })).onboardingStage).toBe("COMPLETE");
  expect(await prisma.itineraryVersion.count({ where: { tripId: f.tripId } })).toBe(versions);
  expect(await prisma.packingItem.count({ where: { tripId: f.tripId, label: "Light layer" } })).toBe(1);
  expect(f.values.has(`ai-retry:${f.job.id}`)).toBe(false);
});

it("stops after three delayed retries instead of continually calling the provider", async () => {
  let now = Date.now(); vi.spyOn(Date, "now").mockImplementation(() => now);
  const f = await fixture(new AIError("RATE_LIMITED", "Temporary rate limit"), 10);
  for (let i = 0; i < 4; i++) { await f.tasks().alarm(); now = (f.alarm() ?? now) + 1; }
  expect(f.calls()).toBe(4);
  expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: f.job.id } })).status).toBe("FAILED");
  expect(f.alarm()).toBeNull();
});

it.each([
  new AIError("QUOTA", "Billing limit"),
  new AIError("AUTH", "Key rejected"),
  new AIError("RATE_LIMITED", "Long server delay", 3600_000),
])("does not automatically retry failures that need administrator action or a long wait: $code", async error => {
  const f = await fixture(error, 10); await f.tasks().alarm();
  expect(f.calls()).toBe(1);
  expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: f.job.id } })).status).toBe("FAILED");
  expect(f.alarm()).toBeNull();
});
