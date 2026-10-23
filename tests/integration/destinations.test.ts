import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { chooseDestination, getDestinationSearch, runDestinationSearch, safeSource, startDestinationSearch } from "@/server/destinations/service";
import { discoveryInput, type DiscoveryInput } from "@/server/destinations/schema";
import { chooseNormal } from "@/server/trips/onboarding";
import { getTripPlan } from "@/server/plans/access";
import type { Generator } from "@/server/planner/run";
import { makeUser, resetDb } from "./helpers";
const runtime = currentRuntime(), oldKey = process.env.OPENAI_API_KEY;
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true }); process.env.OPENAI_API_KEY = "isolated-destination-test-key"; });
afterEach(() => { setTestRuntime(runtime); if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; });
const input: DiscoveryInput = { departureCity: "Beirut, Lebanon", timing: "month", startDate: "", endDate: "", month: "2030-05", days: 7, adults: 2, children: 1, budget: 1500, climate: "Mild & comfortable", interests: ["History & culture", "Food & markets"], pace: "RELAXED", distance: "Up to 6 hours", crowds: "Quiet & less crowded", constraints: "Easy walks and child-friendly activities" };
import { fixtureIdeas } from "../fixtures/destinations";

function generator(data = fixtureIdeas(), inspect?: (opts: { input: string; webSearch?: boolean }) => void): Generator {
  return (async opts => { inspect?.(opts); return { data, model: "isolated", sources: ["https://example.test/tourism"], usage: null }; }) as Generator;
}
it("validates upcoming timing, budget and interests before queuing, and reports configuration without consuming allowance", async () => {
  const user = await makeUser("Explorer");
  await expect(startDestinationSearch(user.id, { ...input, interests: [] })).rejects.toMatchObject({ code: "VALIDATION" });
  expect(discoveryInput.safeParse({ ...input, timing: "dates", startDate: "2030-05-10", endDate: "2030-05-01" }).success).toBe(false);
  expect(discoveryInput.safeParse({ ...input, timing: "dates", startDate: "2000-05-01", endDate: "2000-05-02" }).success).toBe(false);
  delete process.env.OPENAI_API_KEY;
  await expect(startDestinationSearch(user.id, input)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  expect(await prisma.rateLimitHit.count()).toBe(0); expect(await prisma.destinationSearch.count()).toBe(0);
});
it("deduplicates pending searches, keeps results private, and returns exactly five researched ideas", async () => {
  const user = await makeUser("Explorer"), other = await makeUser("Other");
  const first = await startDestinationSearch(user.id, input), duplicate = await startDestinationSearch(user.id, input);
  expect(duplicate.id).toBe(first.id); expect(await prisma.rateLimitHit.count()).toBe(1);
  await expect(getDestinationSearch(other.id, first.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(chooseDestination(other.id, first.id, 0)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await runDestinationSearch(first.id, generator(undefined, opts => { const known = JSON.parse(opts.input.match(/<traveler_data>\n([\s\S]*)\n<\/traveler_data>/)![1]); expect(known.departureCity).toBe(input.departureCity); expect(known.budgetBasis).toContain("per person"); expect(known.constraints).toContain("child-friendly"); expect(opts.webSearch).toBe(true); }));
  const completed = await getDestinationSearch(user.id, first.id);
  expect(completed?.status).toBe("SUCCEEDED"); expect(completed?.result?.ideas).toHaveLength(5);
  expect(completed?.result?.ideas.every(i => i.sourceUrls.join() === "https://example.test/tourism")).toBe(true);
  expect(await prisma.trip.count()).toBe(0);
});
it("carries selected destination and answers into an unpaid draft, with idempotent selection and current plan rules", async () => {
  const user = await makeUser("Explorer");
  const queued = await startDestinationSearch(user.id, { ...input, timing: "dates", startDate: "2030-05-01", endDate: "2030-05-04", days: 20 });
  await runDestinationSearch(queued.id, generator());
  expect((await getDestinationSearch(user.id, queued.id))?.input.days).toBe(4);
  const chosen = await chooseDestination(user.id, queued.id, 2), duplicate = await chooseDestination(user.id, queued.id, 2);
  expect(duplicate.id).toBe(chosen.id); expect(await prisma.trip.count()).toBe(1); expect(chosen.next).toContain("/premium?created=1");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: chosen.id }, include: { destinations: true, days: true } });
  expect(trip.onboardingStage).toBe("PLAN"); expect(trip.destinations[0].name).toBe("Istanbul"); expect(trip.days).toHaveLength(4);
  expect(trip.budgetMinor).toBe(450000); expect(trip.currency).toBe("USD"); expect(trip.interests).toEqual(input.interests); expect(trip.adults).toBe(2); expect(trip.children).toBe(1);
  expect(trip.preferences).toContain(input.constraints); expect((await getTripPlan(chosen.id)).premium).toBe(false); expect(await prisma.premiumCheckout.count()).toBe(0);
  await chooseNormal(user.id, chosen.id);
  expect((await chooseDestination(user.id, queued.id, 2)).next).toContain("/onboarding");
});
it("does not turn a flexible travel month into invented exact trip dates", async () => {
  const user = await makeUser("Explorer"); const q = await startDestinationSearch(user.id, input); await runDestinationSearch(q.id, generator());
  const { id } = await chooseDestination(user.id, q.id, 0); const trip = await prisma.trip.findUniqueOrThrow({ where: { id } });
  expect(trip.startDate).toBeNull(); expect(trip.endDate).toBeNull(); expect(trip.notes).toContain("May 2030");
  await expect(chooseDestination(user.id, q.id, 5)).rejects.toMatchObject({ code: "VALIDATION" });
});
it("fails honestly on malformed or repeated results and can retry without leaving a running job", async () => {
  const user = await makeUser("Explorer"); const q = await startDestinationSearch(user.id, input); const data = fixtureIdeas(); data.ideas[1] = data.ideas[0];
  await runDestinationSearch(q.id, generator(data)); expect((await getDestinationSearch(user.id, q.id))?.status).toBe("FAILED");
  const retry = await startDestinationSearch(user.id, input); expect(retry.id).not.toBe(q.id);
  await runDestinationSearch(retry.id, (async () => { throw new Error("Synthetic upstream failure"); }) as Generator);
  expect((await getDestinationSearch(user.id, retry.id))?.error).toContain("couldn't finish");
});
it("resumes interrupted searches and suppresses unverified or long-range forecasts", async () => {
  const user = await makeUser("Explorer"); const q = await startDestinationSearch(user.id, input); await prisma.destinationSearch.update({ where: { id: q.id }, data: { status: "RUNNING" } });
  const data = fixtureIdeas(); data.ideas[0].weatherKind = "forecast"; await runDestinationSearch(q.id, generator(data));
  expect((await getDestinationSearch(user.id, q.id))?.result?.ideas[0].weatherKind).toBe("unavailable");
  expect(safeSource("javascript:alert(1)")).toBeNull(); expect(safeSource("https://user:pass@example.test")).toBeNull();
});
it("bounds free discovery usage per signed-in account", async () => {
  const user = await makeUser("Explorer");
  for (let i = 0; i < 5; i++) { const q = await startDestinationSearch(user.id, input); await prisma.destinationSearch.update({ where: { id: q.id }, data: { status: "FAILED" } }); }
  await expect(startDestinationSearch(user.id, input)).rejects.toMatchObject({ code: "RATE_LIMITED" });
});
