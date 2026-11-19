import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { balance, grant } from "@/server/credits/service";
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
