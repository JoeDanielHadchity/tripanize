import { beforeEach, afterEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { saveTripFeatures } from "@/server/plans/selection";
import { getTripPlan } from "@/server/plans/access";
import { billingSummary } from "@/server/billing/service";
import { getExpenseData } from "@/server/expenses/service";
import { PREMIUM_FEATURE_KEYS, tripCheckoutQuote } from "@/lib/plans";
import { makeTrip, makeUser, resetDb } from "./helpers";

const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true }); });
afterEach(() => setTestRuntime(runtime));

it("saves an owner's selections per trip without granting access or creating a payment", async () => {
  const owner = await makeUser("Owner");
  const tripId = await makeTrip(owner.id, { adults: 4 });
  const other = await makeTrip(owner.id);
  const before = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  expect((await billingSummary(owner.id, tripId)).selectedFeatures).toEqual([]);
  await saveTripFeatures(owner.id, tripId, ["expenses", "chat", "expenses"]);
  const summary = await billingSummary(owner.id, tripId);
  expect(summary.selectedFeatures).toEqual(["expenses", "chat"]);
  expect(tripCheckoutQuote(summary.selectedFeatures, summary.people, summary.creditMinor).dueMinor).toBe(1500);
  expect((await getTripPlan(tripId)).premium).toBe(false);
  await expect(getExpenseData(owner.id, tripId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await prisma.premiumCheckout.count()).toBe(0);
  expect((await billingSummary(owner.id, other)).selectedFeatures).toEqual([]);
  expect(await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).toMatchObject({ name: before.name, startDate: before.startDate, budgetMinor: before.budgetMinor, version: before.version });
  await saveTripFeatures(owner.id, tripId, []);
  const normal = await billingSummary(owner.id, tripId);
  expect(tripCheckoutQuote(normal.selectedFeatures, normal.people, normal.creditMinor).dueMinor).toBe(0);
  expect(await prisma.premiumCheckout.count()).toBe(0);
});

it("restricts shared feature selection to the organizer and rejects invalid input", async () => {
  const owner = await makeUser("Owner"), member = await makeUser("Member"), outsider = await makeUser("Outsider");
  const tripId = await makeTrip(owner.id);
  await prisma.tripMembership.create({ data: { tripId, userId: member.id, role: "COLLABORATOR" } });
  await expect(saveTripFeatures(member.id, tripId, ["chat"])).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(saveTripFeatures(outsider.id, tripId, ["chat"])).rejects.toMatchObject({ code: "NOT_FOUND" });
  for (const invalid of [["free-premium"], "chat", ["chat", 123], { selectedFeatures: ["chat"], amount: 0 }]) await expect(saveTripFeatures(owner.id, tripId, invalid)).rejects.toThrow();
  expect((await billingSummary(owner.id, tripId)).selectedFeatures).toEqual([]);
});

it("quotes one $15 package, keeps Normal free and grandfathers verified credit for every group size", () => {
  for (const people of [1, 2, 3, 6, 7, 12, 13, 50, 100]) {
    expect(tripCheckoutQuote(["chat"], people, 0).dueMinor).toBe(1500);
    expect(tripCheckoutQuote(PREMIUM_FEATURE_KEYS, people, 0).dueMinor).toBe(1500);
    expect(tripCheckoutQuote([], people, 0).dueMinor).toBe(0);
    expect(tripCheckoutQuote(["chat"], people, 900).dueMinor).toBe(0);
  }
});
