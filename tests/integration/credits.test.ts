import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { balance, grant, settleOpenHolds, settleRef, withCredits, hold } from "@/server/credits/service";
import { enqueueJob, cancelJob } from "@/server/planner/jobs";
import { sendAssistantMessage, cancelAssistantReply } from "@/server/assistant/service";
import { requestDiscovery } from "@/server/events/discovery";
import { startDestinationSearch } from "@/server/destinations/service";
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

it("gives 15 welcome credits to verified accounts, once, and 500 once to accounts invited to Premium", async () => {
  on();
  const fresh = await verified("Fresh"); const unverified = await makeUser("Unverified");
  const admin = await verified("Company", "company-credits@example.test");
  const invited = await verified("Invited", "invited-credits@example.test");
  await prisma.trialInvitation.create({ data: { email: invited.email, tokenHash: "fixture-hash", emailText: "Fixture invitation", createdById: admin.id, expiresAt: new Date(Date.now() + 86400_000) } });
  expect(await balance(fresh.id)).toBe(15);
  expect(await balance(fresh.id)).toBe(15);
  expect(await balance(unverified.id)).toBe(0);
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
  await expect(enqueueJob(owner.id, tripId, "days", { dates: ["2027-05-02", "2027-05-03"] })).rejects.toMatchObject({ code: "CREDITS", details: { needed: 6, balance: 3, payerIsYou: true } });
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

it("refunds a cancelled assistant question, and charges event and destination searches", async () => {
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
  const search = await startDestinationSearch(owner.id, { ...DISCOVERY_DEFAULTS, departureCity: "London, UK", timing: "flexible", interests: ["Food & markets"] });
  expect(await balance(owner.id)).toBe(11);
  await prisma.destinationSearch.update({ where: { id: search.id }, data: { status: "FAILED" } }); await settleRef("destination", search.id);
  expect(await balance(owner.id)).toBe(15);
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
