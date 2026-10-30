import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { chooseDestination, createDestinationDraft, deleteDestinationSearch, getDestinationSearch, getDestinationWorkspace, runDestinationSearch, safeSource, saveDestinationDraft, startDestinationSearch } from "@/server/destinations/service";
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
  expect(duplicate.id).toBe(first.id); expect(await prisma.destinationSearch.count()).toBe(1);
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
  expect(duplicate.id).toBe(chosen.id); expect(await prisma.trip.count()).toBe(1); expect(chosen.next).toBe(`/trips?selected=${chosen.id}`);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: chosen.id }, include: { destinations: true, days: true } });
  expect(trip.onboardingStage).toBe("PLAN"); expect(trip.destinations[0].name).toBe("Istanbul"); expect(trip.days).toHaveLength(4);
  expect(trip.budgetMinor).toBe(450000); expect(trip.currency).toBe("USD"); expect(trip.interests).toEqual(input.interests); expect(trip.adults).toBe(2); expect(trip.children).toBe(1);
  expect(trip.preferences).toContain(input.constraints); expect((await getTripPlan(chosen.id)).premium).toBe(false); expect(await prisma.premiumCheckout.count()).toBe(0);
  await chooseNormal(user.id, chosen.id);
  expect((await chooseDestination(user.id, queued.id, 2)).next).toBe(`/trips?selected=${chosen.id}`);
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
  for (let i = 0; i < 5; i++) { const q = await startDestinationSearch(user.id, input); await prisma.destinationSearch.update({ where: { id: q.id }, data: { status: "SUCCEEDED" } }); }
  await expect(startDestinationSearch(user.id, input)).rejects.toMatchObject({ code: "RATE_LIMITED" });
});

it("does not charge the daily destination allowance for failed searches", async () => {
  const user = await makeUser("Explorer");
  for (let i = 0; i < 6; i++) { const q = await startDestinationSearch(user.id, input); await prisma.destinationSearch.update({ where: { id: q.id }, data: { status: "FAILED" } }); }
  expect((await startDestinationSearch(user.id, input)).id).toBeTruthy();
});
it("keeps five usable recommendations when researched descriptions exceed display limits", async () => {
  const user = await makeUser("Explorer"); const q = await startDestinationSearch(user.id, input); const data = fixtureIdeas();
  data.summary = "A helpful summary. ".repeat(70);
  data.ideas[0].whyFits = "A detailed reason to visit. ".repeat(80);
  data.ideas[1].weather = "Typical conditions with rain possible. ".repeat(30);
  data.ideas[2].experiences[0] = "A very detailed experience ".repeat(20);
  await runDestinationSearch(q.id, generator(data));
  const result = await getDestinationSearch(user.id, q.id); expect(result?.status).toBe("SUCCEEDED");
  expect(result?.result?.ideas).toHaveLength(5); expect(result?.result?.summary.length).toBeLessThanOrEqual(600);
  expect(result?.result?.ideas[0].whyFits.length).toBeLessThanOrEqual(700); expect(result?.result?.ideas[1].weather.length).toBeLessThanOrEqual(400);
});
it("keeps researched sources clickable without raw citation markup or broken URLs in card copy", async () => {
  const user = await makeUser("Explorer"); const q = await startDestinationSearch(user.id, input); const data = fixtureIdeas();
  data.ideas[0].whyFits = "Good seasonal fit. ([example.test](https://example.test/tourism?utm_source=openai))";
  data.ideas[0].experiences[0] = "Explore old streets. ([example.test](https://example.test/tourism?utm_source=openai))";
  await runDestinationSearch(q.id, generator(data));
  const clean = (await getDestinationSearch(user.id, q.id))!.result!.ideas[0];
  expect(clean.whyFits).toBe("Good seasonal fit."); expect(clean.experiences[0]).toBe("Explore old streets."); expect(clean.sourceUrls).toEqual(["https://example.test/tourism"]);
  const saved = (await prisma.destinationSearch.findUniqueOrThrow({ where: { id: q.id } })).result as unknown as ReturnType<typeof fixtureIdeas>;
  saved.ideas[0].experiences[0] = "Explore old streets. ([example.test](https://example.test/a-previously-cut";
  await prisma.destinationSearch.update({ where: { id: q.id }, data: { result: saved } });
  expect((await getDestinationSearch(user.id, q.id))!.result!.ideas[0].experiences[0]).toBe("Explore old streets.");
});

it("keeps numbered drafts for each account without requiring AI or consuming research allowance", async () => {
  const user = await makeUser("Explorer"), other = await makeUser("Other");
  delete process.env.OPENAI_API_KEY;
  const first = await createDestinationDraft(user.id), second = await createDestinationDraft(user.id), separate = await createDestinationDraft(other.id);
  expect([first.number, second.number, separate.number]).toEqual([1, 2, 1]);
  expect(first.status).toBe("DRAFT");
  const workspace = await getDestinationWorkspace(user.id);
  expect(workspace.searches.map(s => s.id)).toEqual([first.id, second.id]);
  expect(workspace.current?.id).toBe(second.id);
  expect(await prisma.destinationSearch.count({ where: { queuedAt: { not: null } } })).toBe(0);
});

it("saves each draft's answers privately and copies answers into a separate numbered search", async () => {
  const user = await makeUser("Explorer"), other = await makeUser("Other");
  const first = await createDestinationDraft(user.id);
  await saveDestinationDraft(user.id, first.id, { ...input, departureCity: "Paris, France" });
  const second = await createDestinationDraft(user.id, first.id);
  await saveDestinationDraft(user.id, second.id, { ...input, departureCity: "London, UK", budget: 2500 });
  expect((await getDestinationSearch(user.id, first.id))?.input.departureCity).toBe("Paris, France");
  expect((await getDestinationSearch(user.id, second.id))?.input.budget).toBe(2500);
  await expect(saveDestinationDraft(other.id, first.id, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(createDestinationDraft(other.id, first.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(startDestinationSearch(other.id, input, first.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("queues distinct searches independently, deduplicates repeated submission of the same search and preserves both results", async () => {
  const user = await makeUser("Explorer");
  const first = await createDestinationDraft(user.id), second = await createDestinationDraft(user.id);
  await startDestinationSearch(user.id, input, first.id);
  await startDestinationSearch(user.id, { ...input, budget: 3000 }, second.id);
  expect((await startDestinationSearch(user.id, input, first.id)).id).toBe(first.id);
  expect(await prisma.destinationSearch.count()).toBe(2);
  await runDestinationSearch(first.id, generator());
  const secondResult = fixtureIdeas(); secondResult.summary = "Different travel ideas for a different budget";
  await runDestinationSearch(second.id, generator(secondResult));
  expect((await getDestinationSearch(user.id, first.id))?.result?.summary).not.toBe(secondResult.summary);
  expect((await getDestinationSearch(user.id, second.id))?.result?.summary).toBe(secondResult.summary);
  expect((await getDestinationWorkspace(user.id)).searches.map(s => s.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
  expect(await saveDestinationDraft(user.id, first.id, { ...input, budget: 9999 })).toEqual({ saved: false });
  expect((await getDestinationSearch(user.id, first.id))?.input.budget).toBe(input.budget);
  await expect(startDestinationSearch(user.id, input, first.id)).rejects.toMatchObject({ code: "CONFLICT" });
});

it("keeps earlier results when their answers are copied into a new draft", async () => {
  const user = await makeUser("Explorer");
  const first = await startDestinationSearch(user.id, input); await runDestinationSearch(first.id, generator());
  const original = await getDestinationSearch(user.id, first.id);
  const copy = await createDestinationDraft(user.id, first.id);
  expect(copy).toMatchObject({ number: 2, status: "DRAFT", input: original?.input, result: null });
  expect((await getDestinationSearch(user.id, first.id))?.result).toEqual(original?.result);
});

it("counts research when an old draft is submitted and leaves quota-blocked drafts intact", async () => {
  const user = await makeUser("Explorer");
  const draft = await createDestinationDraft(user.id);
  await prisma.destinationSearch.update({ where: { id: draft.id }, data: { createdAt: new Date("2000-01-01") } });
  for (let i = 0; i < 5; i++) { const q = await startDestinationSearch(user.id, input); await prisma.destinationSearch.update({ where: { id: q.id }, data: { status: "SUCCEEDED" } }); }
  await expect(startDestinationSearch(user.id, input, draft.id)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect((await getDestinationSearch(user.id, draft.id))?.status).toBe("DRAFT");
  await prisma.destinationSearch.updateMany({ where: { userId: user.id, status: "SUCCEEDED" }, data: { queuedAt: new Date("2000-01-01") } });
  await startDestinationSearch(user.id, input, draft.id);
  const queued = await prisma.destinationSearch.findUniqueOrThrow({ where: { id: draft.id } });
  expect(queued.queuedAt!.getTime()).toBeGreaterThan(Date.now() - 5000);
});

it("does not collapse different legacy search requests into an unrelated active search", async () => {
  const user = await makeUser("Explorer");
  const first = await startDestinationSearch(user.id, input);
  const second = await startDestinationSearch(user.id, { ...input, budget: 3000 });
  expect(first.id).not.toBe(second.id);
});

it("deletes only the owner's search, removes its private content and keeps search numbers increasing", async () => {
  const user = await makeUser("Explorer"), other = await makeUser("Other");
  const search = await createDestinationDraft(user.id);
  await saveDestinationDraft(user.id, search.id, input);
  await expect(deleteDestinationSearch(other.id, search.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(deleteDestinationSearch(user.id, undefined as unknown as string)).rejects.toMatchObject({ code: "VALIDATION" });
  expect((await getDestinationWorkspace(user.id)).searches).toHaveLength(1);
  delete process.env.OPENAI_API_KEY;
  await deleteDestinationSearch(user.id, search.id);
  await deleteDestinationSearch(user.id, search.id); // Repeated deletion is harmless.
  expect(await getDestinationWorkspace(user.id)).toEqual({ searches: [], current: null });
  await expect(getDestinationSearch(user.id, search.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(saveDestinationDraft(user.id, search.id, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(createDestinationDraft(user.id, search.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const deleted = await prisma.destinationSearch.findUniqueOrThrow({ where: { id: search.id } });
  expect(deleted).toMatchObject({ input: {}, result: null, error: null, selectedTripId: null });
  expect(deleted.deletedAt).not.toBeNull();
  expect((await createDestinationDraft(user.id)).number).toBe(2);
});

it("keeps a trip created from a deleted search and prevents the search from being reused", async () => {
  const user = await makeUser("Explorer");
  const search = await startDestinationSearch(user.id, input);
  await runDestinationSearch(search.id, generator());
  const trip = await chooseDestination(user.id, search.id, 0);
  await deleteDestinationSearch(user.id, search.id);
  expect(await prisma.trip.findUnique({ where: { id: trip.id } })).not.toBeNull();
  expect(await prisma.trip.count()).toBe(1);
  await expect(chooseDestination(user.id, search.id, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(startDestinationSearch(user.id, input, search.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("does not start deleted queued searches", async () => {
  const user = await makeUser("Explorer"); const search = await startDestinationSearch(user.id, input);
  await deleteDestinationSearch(user.id, search.id);
  let calls = 0;
  await runDestinationSearch(search.id, (async () => { calls++; throw new Error("Must not run"); }) as Generator);
  expect(calls).toBe(0);
  expect(await getDestinationWorkspace(user.id)).toEqual({ searches: [], current: null });
});

it.each([false, true])("discards in-flight results and errors when the search is deleted (provider fails: %s)", async fails => {
  const user = await makeUser("Explorer"); const search = await startDestinationSearch(user.id, input);
  let started!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const running = runDestinationSearch(search.id, (async opts => {
    started(); await gate;
    if (fails) throw new Error("Synthetic interrupted research");
    return generator()(opts);
  }) as Generator);
  await ready;
  try { await deleteDestinationSearch(user.id, search.id); } finally { release(); }
  await running;
  const row = await prisma.destinationSearch.findUniqueOrThrow({ where: { id: search.id } });
  expect(row).toMatchObject({ input: {}, result: null, error: null, status: fails ? "FAILED" : "SUCCEEDED" });
  expect(row.deletedAt).not.toBeNull();
  expect(await getDestinationWorkspace(user.id)).toEqual({ searches: [], current: null });
});

it("keeps the daily research allowance after successful searches are deleted", async () => {
  const user = await makeUser("Explorer");
  for (let i = 0; i < 5; i++) {
    const search = await startDestinationSearch(user.id, input);
    await prisma.destinationSearch.update({ where: { id: search.id }, data: { status: "SUCCEEDED" } });
    await deleteDestinationSearch(user.id, search.id);
  }
  const draft = await createDestinationDraft(user.id);
  expect(draft.number).toBe(6);
  await expect(startDestinationSearch(user.id, input, draft.id)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect((await getDestinationWorkspace(user.id)).searches.map(s => s.id)).toEqual([draft.id]);
});
