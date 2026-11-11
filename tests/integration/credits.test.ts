import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { balance, creditsView, grant, settleOpenHolds, settleRef, withCredits, hold } from "@/server/credits/service";
import { enqueueJob, cancelJob } from "@/server/planner/jobs";
import { sendAssistantMessage, cancelAssistantReply } from "@/server/assistant/service";
import { requestDiscovery } from "@/server/events/discovery";
import { deleteDestinationSearch, freeDestinationSearchLeft, startDestinationSearch } from "@/server/destinations/service";
import { DISCOVERY_DEFAULTS } from "@/server/destinations/schema";
import { randomUUID } from "node:crypto";
import { makeUser, makeTrip, resetDb } from "./helpers";

const runtime = currentRuntime(), key = process.env.OPENAI_API_KEY;
const on = () => setTestRuntime({ ...currentRuntime(), creditsEnabled: true });
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true }); process.env.OPENAI_API_KEY = "isolated-credits-test"; });
afterEach(() => { setTestRuntime(runtime); if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; });

async function verified(name: string, email?: string) {
  const u = await makeUser(name, email);
  return prisma.user.update({ where: { id: u.id }, data: { emailVerified: true } });
}
async function premiumTrip(ownerId: string) {
  const tripId = await makeTrip(ownerId);
  await prisma.premiumCheckout.create({ data: { tripId, buyerId: ownerId, environment: "live", priceId: "fixture", amountMinor: 1500, targetCapacity: 0, status: "COMPLETED" } });
  return tripId;
}
const finish = (jobId: string, status: "SUCCEEDED" | "FAILED") => prisma.generationJob.update({ where: { id: jobId }, data: { status, finishedAt: new Date() } });

it("changes nothing while credits are switched off", async () => {
  const owner = await verified("Owner"); const tripId = await premiumTrip(owner.id);
  await enqueueJob(owner.id, tripId, "full", {});
  expect(await prisma.creditHold.count()).toBe(0);
  expect(await balance(owner.id)).toBe(0);
  expect(await prisma.creditEntry.count()).toBe(0);
});

it("gives 15 welcome credits to every account, once, and 500 once to verified accounts invited to Premium", async () => {
  on();
  const fresh = await verified("Fresh"); const unverified = await makeUser("Unverified");
  const admin = await verified("Company", "company-credits@example.test");
  const invited = await verified("Invited", "invited-credits@example.test");
  await prisma.trialInvitation.create({ data: { email: invited.email, tokenHash: "fixture-hash", emailText: "Fixture invitation", createdById: admin.id, expiresAt: new Date(Date.now() + 86400_000) } });
  expect(await balance(fresh.id)).toBe(15);
  expect(await balance(fresh.id)).toBe(15);
  expect(await balance(unverified.id)).toBe(15);
  expect(await balance(invited.id)).toBe(515);
  expect(await balance(invited.id)).toBe(515);
  expect(await prisma.creditEntry.count({ where: { userId: invited.id } })).toBe(2);
});

it("holds 3 credits a day for planning, spends them on success and refunds a failure or a cancel", async () => {
  on();
  const owner = await verified("Owner"); const tripId = await premiumTrip(owner.id);
  await grant(owner.id, 85, { kind: "purchase", dedupeKey: "fixture-purchase" });
  const first = await enqueueJob(owner.id, tripId, "full", {});
  expect(await balance(owner.id)).toBe(100 - 12);
  await finish(first.jobId, "SUCCEEDED"); await settleRef("job", first.jobId);
  expect(await balance(owner.id)).toBe(88);
  expect((await prisma.creditEntry.findFirstOrThrow({ where: { kind: "spend" } })).amount).toBe(-12);

  const second = await enqueueJob(owner.id, tripId, "days", { dates: ["2027-05-02", "2027-05-03"] });
  expect(await balance(owner.id)).toBe(82);
  await finish(second.jobId, "FAILED"); await settleRef("job", second.jobId);
  expect(await balance(owner.id)).toBe(88);

  const third = await enqueueJob(owner.id, tripId, "days", { dates: ["2027-05-04"] });
  expect(await balance(owner.id)).toBe(85);
  await cancelJob(owner.id, tripId, third.jobId);
  expect(await balance(owner.id)).toBe(88);
  // Settling twice never spends twice.
  await settleRef("job", first.jobId);
  expect(await balance(owner.id)).toBe(88);
});

it("refuses an action the payer can't afford, with the price and balance, and queues nothing", async () => {
  on();
  const owner = await verified("Owner"); const tripId = await premiumTrip(owner.id);
  const first = await enqueueJob(owner.id, tripId, "full", {});
  await finish(first.jobId, "SUCCEEDED"); await settleRef("job", first.jobId);
  // 15 welcome credits − 12 = 3 left; regenerating 2 days needs 6.
  await expect(enqueueJob(owner.id, tripId, "days", { dates: ["2027-05-02", "2027-05-03"] })).rejects.toMatchObject({ code: "CREDITS", message: "Not enough credits. This uses 6 credits and you have 3.", details: { needed: 6, balance: 3, payerIsYou: true } });
  expect(await prisma.generationJob.count({ where: { kind: "days" } })).toBe(0);
});

it("charges editors' AI to the organizer, unless the organizer switches it off; viewers pay their own", async () => {
  on();
  const owner = await verified("Owner"), editor = await verified("Editor"), viewer = await verified("Viewer");
  const tripId = await premiumTrip(owner.id);
  await prisma.tripMembership.create({ data: { tripId, userId: editor.id, role: "COLLABORATOR" } });
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  await sendAssistantMessage(editor.id, tripId, { clientId: randomUUID(), message: "What should we do on day 2?", selectedDate: null });
  expect(await balance(owner.id)).toBe(13);
  expect(await balance(editor.id)).toBe(15);
  await sendAssistantMessage(viewer.id, tripId, { clientId: randomUUID(), message: "Is day 3 busy?", selectedDate: null });
  expect(await balance(viewer.id)).toBe(13);
  await prisma.trip.update({ where: { id: tripId }, data: { membersUseCredits: false } });
  await expect(enqueueJob(editor.id, tripId, "days", { dates: ["2027-05-02"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("refunds a cancelled assistant question, and charges event searches", async () => {
  on();
  const owner = await verified("Owner"); const tripId = await premiumTrip(owner.id);
  const { id } = await sendAssistantMessage(owner.id, tripId, { clientId: randomUUID(), message: "Plan a rainy afternoon", selectedDate: null });
  expect(await balance(owner.id)).toBe(13);
  await cancelAssistantReply(owner.id, tripId, id);
  expect(await balance(owner.id)).toBe(15);
  const run = await requestDiscovery(owner.id, tripId);
  expect(await balance(owner.id)).toBe(12);
  await prisma.discoveryRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date() } }); await settleRef("discovery", run.id);
  expect(await balance(owner.id)).toBe(15);
});

it("gives every account one free destination search; later searches cost 4 credits", async () => {
  on();
  const owner = await verified("Owner");
  const answers = (interest: string) => ({ ...DISCOVERY_DEFAULTS, departureCity: "London, UK", timing: "flexible", interests: [interest] });
  expect(await freeDestinationSearchLeft(owner.id)).toBe(true);
  // A first search that fails doesn't use up the free one.
  const broken = await startDestinationSearch(owner.id, answers("Food & markets"));
  expect(await balance(owner.id)).toBe(15);
  await prisma.destinationSearch.update({ where: { id: broken.id }, data: { status: "FAILED" } }); await settleRef("destination", broken.id);
  expect(await freeDestinationSearchLeft(owner.id)).toBe(true);
  const first = await startDestinationSearch(owner.id, answers("Food & markets"));
  expect(await balance(owner.id)).toBe(15);
  expect(await prisma.creditHold.count()).toBe(0);
  await prisma.destinationSearch.update({ where: { id: first.id }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
  expect(await freeDestinationSearchLeft(owner.id)).toBe(false);
  // Deleting the free search doesn't give it back.
  await deleteDestinationSearch(owner.id, first.id);
  expect(await freeDestinationSearchLeft(owner.id)).toBe(false);
  const second = await startDestinationSearch(owner.id, answers("Nightlife"));
  expect(await balance(owner.id)).toBe(11);
  await prisma.destinationSearch.update({ where: { id: second.id }, data: { status: "FAILED" } }); await settleRef("destination", second.id);
  expect(await balance(owner.id)).toBe(15);
  // Without enough credits, a second search is refused.
  await grant(owner.id, -13, { kind: "adjust" });
  await expect(startDestinationSearch(owner.id, answers("Beaches & islands"))).rejects.toMatchObject({ code: "CREDITS" });
});

it("refunds inline actions that throw, and the hourly sweep refunds holds left behind", async () => {
  on();
  const owner = await verified("Owner"); const tripId = await premiumTrip(owner.id);
  await expect(withCredits({ actorId: owner.id, tripId, action: "packing", credits: 1 }, async () => { throw new Error("AI timed out"); })).rejects.toThrow("AI timed out");
  expect(await balance(owner.id)).toBe(15);
  await withCredits({ actorId: owner.id, tripId, action: "packing", credits: 1 }, async () => "ok");
  expect(await balance(owner.id)).toBe(14);
  const orphan = await hold({ actorId: owner.id, tripId, action: "swap", credits: 2, refKind: "inline" });
  await prisma.creditHold.update({ where: { id: orphan!.id }, data: { createdAt: new Date(Date.now() - 3600_000) } });
  expect(await balance(owner.id)).toBe(12);
  await settleOpenHolds();
  expect(await balance(owner.id)).toBe(14);
});

it("applies credits before launch only to accounts marked as testers", async () => {
  const tester = await verified("Tester"), other = await verified("Other");
  await prisma.user.update({ where: { id: tester.id }, data: { creditsTester: true } });
  expect(await balance(tester.id)).toBe(15);
  expect(await balance(other.id)).toBe(0);
  const otherTrip = await premiumTrip(other.id);
  await enqueueJob(other.id, otherTrip, "full", {});
  expect(await prisma.creditHold.count({ where: { userId: other.id } })).toBe(0);
});

it("drafts only the free 2 days on a free trip, lets credits add chosen days and packing, while swaps stay Premium", async () => {
  const tester = await verified("Tester");
  await prisma.user.update({ where: { id: tester.id }, data: { creditsTester: true } });
  await grant(tester.id, 85, { kind: "purchase", dedupeKey: "fixture-free-trip" });
  const tripId = await makeTrip(tester.id);
  const job = await enqueueJob(tester.id, tripId, "full", {});
  const drafted = ((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.jobId } })).params as { dates: string[] }).dates;
  expect(drafted).toHaveLength(2);
  expect(await balance(tester.id)).toBe(100 - 6);
  await finish(job.jobId, "SUCCEEDED"); await settleRef("job", job.jobId);
  const extra = await enqueueJob(tester.id, tripId, "days", { dates: ["2027-05-04"] });
  expect(await balance(tester.id)).toBe(100 - 9);
  await finish(extra.jobId, "SUCCEEDED"); await settleRef("job", extra.jobId);
  const stop = await prisma.stop.create({ data: { tripId, title: "Fixture stop" } });
  await expect(enqueueJob(tester.id, tripId, "swap", { stopId: stop.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const { requirePremiumAccess } = await import("@/server/plans/access");
  await expect(requirePremiumAccess(tripId, "packing")).resolves.toBeUndefined();
  await expect(requirePremiumAccess(tripId, "expenses")).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("gives unlimited credits to the company administrator account only", async () => {
  setTestRuntime({ ...currentRuntime(), creditsEnabled: true, companyAdminEmail: "unlimited-owner@example.test" });
  const admin = await verified("Company", "unlimited-owner@example.test");
  const other = await verified("Other");
  const editor = await verified("Editor");
  const tripId = await premiumTrip(admin.id);
  await prisma.tripMembership.create({ data: { tripId, userId: editor.id, role: "COLLABORATOR" } });
  // The administrator is never held or charged, with no balance at all, and nor are editors on its trips.
  expect(await hold({ actorId: admin.id, tripId, action: "plan", credits: 999, refKind: "inline" })).toBeNull();
  expect(await hold({ actorId: editor.id, tripId, action: "assistant", credits: 999, refKind: "inline" })).toBeNull();
  expect(await prisma.creditEntry.count({ where: { userId: admin.id } })).toBe(0);
  const view = await creditsView(admin.id);
  expect(view.unlimited).toBe(true);
  // Everyone else still pays: 15 welcome credits can't cover 999.
  await expect(hold({ actorId: other.id, action: "plan", credits: 999, refKind: "inline" })).rejects.toThrow(/Not enough credits/);
  expect((await creditsView(other.id)).unlimited).toBeFalsy();
  // An unverified account with the same email gets nothing special.
  await prisma.user.update({ where: { id: admin.id }, data: { emailVerified: false } });
  await expect(hold({ actorId: admin.id, action: "plan", credits: 999, refKind: "inline" })).rejects.toThrow(/Not enough credits/);
});
