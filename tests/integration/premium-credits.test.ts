import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { balance, grant, hold, settle, topUpTrip, walletBalance, tripWallet, creditsView } from "@/server/credits/service";
import { unlockPremiumWithCredits } from "@/server/billing/credit-unlock";
import { getTripPlan } from "@/server/plans/access";
import { billingSummary } from "@/server/billing/service";
import { PREMIUM_CREDIT_PRICE } from "@/lib/credits";
import { makeUser, makeTrip, resetDb } from "./helpers";

const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true, creditsEnabled: true }); });
afterEach(() => setTestRuntime(runtime));

async function verified(name: string) {
  const u = await makeUser(name);
  return prisma.user.update({ where: { id: u.id }, data: { emailVerified: true } });
}

it("unlocks Premium for a trip with 100 credits, once", async () => {
  const owner = await verified("Rachel"); const tripId = await makeTrip(owner.id);
  await grant(owner.id, 100, { kind: "grant", note: "Gift" }); // 15 welcome + 100
  expect(await balance(owner.id)).toBe(115);
  expect((await billingSummary(owner.id, tripId)).credits).toMatchObject({ active: true, balance: 115, price: PREMIUM_CREDIT_PRICE });
  const plan = await unlockPremiumWithCredits(owner.id, tripId);
  expect(plan.premium).toBe(true);
  expect(plan.source).toBe("credits");
  expect(await balance(owner.id)).toBe(15);
  expect(await walletBalance(tripId)).toBe(100);
  await expect(unlockPremiumWithCredits(owner.id, tripId)).rejects.toThrow(/already has Premium/);
  expect(await balance(owner.id)).toBe(15);
});

it("uses one balance for several trips, and says so when there aren't enough credits", async () => {
  const owner = await verified("Bundle buyer");
  await grant(owner.id, 500, { kind: "purchase", note: "Pro" });
  const trips = [await makeTrip(owner.id), await makeTrip(owner.id), await makeTrip(owner.id)];
  for (const t of trips) await unlockPremiumWithCredits(owner.id, t);
  for (const t of trips) expect((await getTripPlan(t)).premium).toBe(true);
  expect(await balance(owner.id)).toBe(515 - 300);
  const poor = await verified("Poor"); const tripId = await makeTrip(poor.id);
  await expect(unlockPremiumWithCredits(poor.id, tripId)).rejects.toThrow(/uses 100 credits\. You have 15/);
  expect((await getTripPlan(tripId)).premium).toBe(false);
});

it("only lets the organizer unlock", async () => {
  const owner = await verified("Owner"); const tripId = await makeTrip(owner.id);
  const member = await verified("Member");
  await prisma.tripMembership.create({ data: { tripId, userId: member.id, role: "COLLABORATOR" } });
  await grant(member.id, 200, { kind: "grant" });
  await expect(unlockPremiumWithCredits(member.id, tripId)).rejects.toThrow(/organizer/);
});

it("pays AI on the trip from the trip's credits, never from the balance by itself, and tops up only when asked", async () => {
  const owner = await verified("Rachel"); const tripId = await makeTrip(owner.id);
  await grant(owner.id, 100, { kind: "grant" });
  await unlockPremiumWithCredits(owner.id, tripId);
  // 10 planned days: 30 credits, from the trip.
  const h = await hold({ actorId: owner.id, tripId, action: "plan", credits: 30, refKind: "inline" });
  expect(h?.wallet).toBe(true);
  expect(await walletBalance(tripId)).toBe(70);
  await settle(h!.id, "spent");
  expect(await walletBalance(tripId)).toBe(70);
  expect(await balance(owner.id)).toBe(15);
  expect(await creditsView(owner.id, tripId)).toMatchObject({ wallet: true, balance: 70, bank: 15 });
  // A refunded action gives the credits back to the trip.
  const r = await hold({ actorId: owner.id, tripId, action: "swap", credits: 2, refKind: "inline" });
  await settle(r!.id, "refunded");
  expect(await walletBalance(tripId)).toBe(70);
  // Out of trip credits: it asks, and the balance is untouched.
  await expect(hold({ actorId: owner.id, tripId, action: "plan", credits: 90, refKind: "inline" })).rejects.toThrow(/This trip is out of credits.*you have 15/);
  expect(await balance(owner.id)).toBe(15);
  // The organizer moves 10 over.
  await expect(topUpTrip(owner.id, tripId, 20)).rejects.toThrow(/You have 15/);
  expect(await topUpTrip(owner.id, tripId, 10)).toEqual({ trip: 80, bank: 5 });
  const wallet = await tripWallet(owner.id, tripId);
  expect(wallet.history.map(e => e.kind)).toEqual(["topup", "spend", "unlock"]);
  // Free trips still use the balance.
  const free = await makeTrip(owner.id);
  const fh = await hold({ actorId: owner.id, tripId: free, action: "plan", credits: 3, refKind: "inline" });
  expect(fh?.wallet).toBe(false);
  expect(await balance(owner.id)).toBe(2);
});

it("lets only the organizer add credits to a trip", async () => {
  const owner = await verified("Owner"); const tripId = await makeTrip(owner.id);
  const member = await verified("Member");
  await prisma.tripMembership.create({ data: { tripId, userId: member.id, role: "COLLABORATOR" } });
  await expect(topUpTrip(member.id, tripId, 5)).rejects.toThrow(/organizer/);
});
