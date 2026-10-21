import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { serializedDatabase, type Serialize } from "@/server/cloudflare/serialized-db";
import { runJob, claimJob, type Generator, type PlanCheckpoint } from "@/server/planner/run";
import { AIError } from "@/server/ai/openai";
import { makeTrip, makeUser, resetDb } from "./helpers";
import type { Proposal } from "@/server/planner/schema";

beforeEach(resetDb);

async function fixture() {
  const owner = await makeUser("Planner");
  const tripId = await makeTrip(owner.id, { startDate: "2020-05-01", endDate: "2020-05-06" });
  await prisma.destination.updateMany({ where: { tripId }, data: { lat: 38.7, lng: -9.1 } });
  const job = await prisma.generationJob.create({ data: { tripId, kind: "full", params: {}, requestedById: owner.id } });
  await claimJob(job.id);
  return { tripId, job };
}

function proposal(dates: string[]): Proposal {
  return { summary: "Draft", generalNotes: [], unplacedMustSees: [], days: dates.map(date => ({ date, title: "Explore", area: "Lisbon", isTravelDay: false, driveMinutes: null, stops: [], planB: [], planBNote: null, notes: [], questions: [], estCost: null })) };
}

describe("durable AI planning", () => {
  it("resumes from a saved section without repeating it or changing the itinerary", async () => {
    const { tripId, job } = await fixture();
    let saved: PlanCheckpoint | undefined;
    const checkpoints = { load: async () => saved, save: async (value: PlanCheckpoint) => { saved = structuredClone(value); } };
    const calls: string[][] = [];
    const generate = (async (opts: { input: string }) => {
      const data = JSON.parse(opts.input.match(/<trip_data>\n([\s\S]*)\n<\/trip_data>/)![1]);
      calls.push(data.datesToPlan);
      return { data: proposal(data.datesToPlan), model: "test", sources: [`https://example.test/${calls.length}`], usage: null };
    }) as Generator;
    await runJob(job.id, generate, checkpoints);
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("RUNNING");
    expect(saved?.completedDates).toHaveLength(5);
    expect(await prisma.stop.count({ where: { tripId } })).toBe(0);
    await runJob(job.id, generate, checkpoints);
    const done = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(calls.map(d => d.length)).toEqual([5, 1]);
    expect(done.status).toBe("SUCCEEDED");
    expect((done.proposal as unknown as Proposal).days).toHaveLength(6);
    expect((done.checks as { sources: string[] }).sources).toHaveLength(2);
    expect(await prisma.stop.count({ where: { tripId } })).toBe(0);
  });

  it("keeps completed sections available for review if the next section fails", async () => {
    const { job } = await fixture();
    let saved: PlanCheckpoint | undefined;
    const checkpoints = { load: async () => saved, save: async (value: PlanCheckpoint) => { saved = structuredClone(value); } };
    await runJob(job.id, (async () => ({ data: proposal(["2020-05-01", "2020-05-02", "2020-05-03", "2020-05-04", "2020-05-05"]), model: "test", sources: [], usage: null })) as Generator, checkpoints);
    await runJob(job.id, async () => { throw new AIError("UNREACHABLE", "Connection lost."); }, checkpoints);
    const failed = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed.status).toBe("FAILED");
    expect((failed.proposal as unknown as Proposal).days).toHaveLength(5);
  });

  it("keeps a background write outside an unrelated HTTP transaction rollback", async () => {
    const database = currentRuntime().database;
    let pending: Promise<unknown> = Promise.resolve();
    const serialize: Serialize = run => {
      const result = pending.then(run, run);
      pending = result.then(() => undefined, () => undefined);
      return result;
    };
    const background = serializedDatabase(database, serialize);
    let started!: () => void;
    let release!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const http = serialize(() => database.$transaction(async tx => {
      await tx.user.create({ data: { id: "rollback", name: "HTTP", email: "http@example.test" } });
      started();
      await gate;
      throw new Error("Rollback HTTP");
    })).catch(() => undefined);
    await ready;
    const write = background.user.create({ data: { id: "background", name: "AI", email: "ai@example.test" } });
    release();
    await http;
    await write;
    expect(await database.user.findUnique({ where: { id: "rollback" } })).toBeNull();
    expect(await database.user.findUnique({ where: { id: "background" } })).not.toBeNull();
  });

  it("cancels between sections without another API call and preserves the completed draft", async () => {
    const { job } = await fixture();
    let saved: PlanCheckpoint | undefined;
    const checkpoints = { load: async () => saved, save: async (value: PlanCheckpoint) => { saved = structuredClone(value); } };
    await runJob(job.id, (async () => ({ data: proposal(["2020-05-01", "2020-05-02", "2020-05-03", "2020-05-04", "2020-05-05"]), model: "test", sources: [], usage: null })) as Generator, checkpoints);
    await prisma.generationJob.update({ where: { id: job.id }, data: { cancelRequested: true } });
    let called = false;
    await runJob(job.id, async () => { called = true; throw new Error("Must not call upstream"); }, checkpoints);
    const cancelled = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(called).toBe(false);
    expect(cancelled.status).toBe("CANCELLED");
    expect((cancelled.proposal as unknown as Proposal).days).toHaveLength(5);
  });
});
