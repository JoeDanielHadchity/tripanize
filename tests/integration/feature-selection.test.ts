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

it("charges once for the package, accounts for group size and paid credit, and keeps Normal free", () => {
  for (const [people, price] of [[1, 900], [2, 900], [3, 1500], [6, 1500], [7, 2500], [12, 2500]]) {
    expect(tripCheckoutQuote(["chat"], people, 0).dueMinor).toBe(price);
    expect(tripCheckoutQuote(PREMIUM_FEATURE_KEYS, people, 0).dueMinor).toBe(price);
    expect(tripCheckoutQuote([], people, 0).dueMinor).toBe(0);
  }
  expect(tripCheckoutQuote(["expenses"], 4, 900).dueMinor).toBe(600);
  expect(tripCheckoutQuote(PREMIUM_FEATURE_KEYS, 8, 1500).dueMinor).toBe(1000);
  expect(tripCheckoutQuote(["chat"], 4, 2500).dueMinor).toBe(0);
  expect(tripCheckoutQuote(["chat"], 13, 0).dueMinor).toBeNull();
  expect(tripCheckoutQuote([], 13, 0).dueMinor).toBe(0);
});

it("retains a verified purchase when selections change and lets an upgraded group pay only the difference", async () => {
  const owner = await makeUser("Owner");
  const tripId = await makeTrip(owner.id);
  await prisma.premiumCheckout.create({ data: { tripId, buyerId: owner.id, environment: "live", priceId: "isolated-fixture", amountMinor: 900, targetCapacity: 2, status: "COMPLETED" } });
  await saveTripFeatures(owner.id, tripId, []);
  expect((await getTripPlan(tripId)).premium).toBe(true);
  await prisma.trip.update({ where: { id: tripId }, data: { adults: 5 } });
  await saveTripFeatures(owner.id, tripId, ["chat", "packing"]);
  const summary = await billingSummary(owner.id, tripId);
  expect(summary).toMatchObject({ premium: false, creditMinor: 900, people: 5 });
  expect(tripCheckoutQuote(summary.selectedFeatures, summary.people, summary.creditMinor).dueMinor).toBe(600);
  expect(await prisma.premiumCheckout.count()).toBe(1);
});
