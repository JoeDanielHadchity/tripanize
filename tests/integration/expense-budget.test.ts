import { beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { computeBudget } from "@/server/expenses/budget";
import { createExpense, deleteExpense, getExpenseData, recordSettlement, updateExpense } from "@/server/expenses/service";
import { createBooking } from "@/server/bookings/service";
import { addStop } from "@/server/itinerary/service";
import { makeTrip, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

async function summary(userId: string, tripId: string) {
  const data = await getExpenseData(userId, tripId);
  const stops = await prisma.stop.findMany({ where: { tripId, dayId: { not: null } } });
  const bookings = await prisma.booking.findMany({ where: { tripId }, include: { expenses: { where: { deletedAt: null } } } });
  return { ...data, budget: computeBudget({ currency: data.trip.currency, budgetMinor: data.trip.budgetMinor, stops, bookings: bookings.map(b => ({ ...b, hasExpense: Boolean(b.expenses.length) })), expenses: data.expenses }) };
}

it("creating, editing and deleting spending adjusts only the actual balance; repayments and estimates stay separate", async () => {
  const owner = await makeUser("Ana");
  const tripId = await makeTrip(owner.id, { budget: "1000" });
  const day = await prisma.itineraryDay.findFirstOrThrow({ where: { tripId } });
  await addStop(owner.id, tripId, { dayId: day.id, input: { title: "Museum", estCost: "20" } });
  const booking = await createBooking(owner.id, tripId, { title: "Hotel", category: "ACCOMMODATION", status: "BOOKED", currency: "EUR", date: day.date, estCost: "80", finalCost: "100" });
  const before = await summary(owner.id, tripId);
  expect(before.budget).toMatchObject({ actualMinor: 0, projectedMinor: 10000, remainingMinor: 100000 });
  const payer = before.travelers.find(t => t.userId === owner.id)!;
  const other = before.travelers.find(t => t.id !== payer.id)!;
  const input = { description: "Hotel payment", category: "Accommodation", amount: "100", currency: "EUR", date: day.date, payerId: payer.id, method: "EQUAL" as const, participants: before.travelers.map(t => ({ travelerId: t.id })), bookingId: booking.id };
  const expense = await createExpense(owner.id, tripId, input);
  const paid = await summary(owner.id, tripId);
  expect(paid.budget).toMatchObject({ actualMinor: 10000, projectedMinor: 10000, remainingMinor: 90000 });
  await recordSettlement(owner.id, tripId, { fromId: other.id, toId: payer.id, amount: "50", currency: "EUR", paidAt: new Date().toISOString() });
  const settled = await summary(owner.id, tripId);
  expect(settled.budget).toEqual(paid.budget);
  expect(settled.ledger[0].suggestions).toHaveLength(0);
  await updateExpense(owner.id, tripId, expense.id, { ...input, amount: "150" }, expense.version);
  expect((await summary(owner.id, tripId)).budget).toMatchObject({ actualMinor: 15000, projectedMinor: 10000, remainingMinor: 85000 });
  await deleteExpense(owner.id, tripId, expense.id);
  expect((await summary(owner.id, tripId)).budget).toMatchObject({ actualMinor: 0, projectedMinor: 10000, remainingMinor: 100000 });
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).estCostMinor).toBe(8000);
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).budgetMinor).toBe(100000);
});
