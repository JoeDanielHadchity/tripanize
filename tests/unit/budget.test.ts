import { describe, expect, it } from "vitest";
import { computeBudget, type BudgetInput } from "@/server/expenses/budget";

describe("computeBudget", () => {
  it("separates actual expenses and plan estimates, excluding duplicate projections and alternatives", () => {
    const b = computeBudget({
      currency: "EUR",
      budgetMinor: 200000,
      stops: [
        { plan: "A", status: "PLANNED", bookingId: null, estCostMinor: 3000, currency: "EUR" },
        { plan: "B", status: "PLANNED", bookingId: null, estCostMinor: 5000, currency: "EUR" }, // plan B excluded
        { plan: "A", status: "SKIPPED", bookingId: null, estCostMinor: 1000, currency: "EUR" }, // skipped excluded
        { plan: "A", status: "PLANNED", bookingId: "b1", estCostMinor: 40000, currency: "EUR" }, // projection, counted via booking
      ],
      bookings: [
        { id: "b1", status: "PAID", estCostMinor: 40000, finalCostMinor: 42000, currency: "EUR", hasExpense: true }, // original estimate remains separate
        { id: "b2", status: "BOOKED", estCostMinor: 10000, finalCostMinor: null, currency: "EUR", hasExpense: false },
        { id: "b3", status: "TO_BOOK", estCostMinor: 6000, finalCostMinor: null, currency: "EUR", hasExpense: false },
        { id: "b4", status: "CANCELLED", estCostMinor: 9999, finalCostMinor: null, currency: "EUR", hasExpense: false },
        { id: "b5", status: "BOOKED", estCostMinor: 5000, finalCostMinor: null, currency: "USD", hasExpense: false },
      ],
      expenses: [
        { amountMinor: 42000, currency: "EUR", category: "Accommodation", convCurrency: null, convAmountMinor: null },
        { amountMinor: 1000, currency: "USD", category: "Food & drink", convCurrency: null, convAmountMinor: null },
        { amountMinor: 2000, currency: "USD", category: "Transport", convCurrency: "EUR", convAmountMinor: 1840 },
      ],
    });
    expect(b.actualMinor).toBe(43840);
    expect(b.committedBookingsMinor).toBe(10000);
    expect(b.plannedBookingsMinor).toBe(6000);
    expect(b.plannedActivitiesMinor).toBe(3000);
    expect(b.estimatedBookingsMinor).toBe(56000);
    expect(b.projectedMinor).toBe(59000);
    expect(b.remainingMinor).toBe(200000 - 43840);
    expect(b.otherCurrencies).toEqual([{ currency: "USD", actualMinor: 1000, estimatedMinor: 5000 }]);
  });

  it("deducts spending only from the balance and leaves estimates unchanged when a booking payment is linked", () => {
    const input: BudgetInput = { currency: "EUR", budgetMinor: 600000,
      stops: [{ plan: "A", status: "PLANNED", bookingId: null, estCostMinor: 25000, currency: "EUR" }],
      bookings: [{ id: "hotel", status: "BOOKED", estCostMinor: 100000, finalCostMinor: 110000, currency: "EUR", hasExpense: false }], expenses: [] };
    const before = computeBudget(input);
    const after = computeBudget({ ...input, bookings: input.bookings.map(b => ({ ...b, hasExpense: true })), expenses: [{ amountMinor: 110000, currency: "EUR", category: "Accommodation", convCurrency: null, convAmountMinor: null }] });
    expect(before.remainingMinor).toBe(600000);
    expect(after.remainingMinor).toBe(490000);
    expect(after.projectedMinor).toBe(before.projectedMinor);
    expect(after.estimatedBookingsMinor).toBe(100000);
    expect(after.committedBookingsMinor).toBe(0);
  });

  it("handles overspending, no budget, and a zero budget using recorded expenses", () => {
    const input: BudgetInput = { currency: "EUR", budgetMinor: 1000, stops: [], bookings: [], expenses: [{ amountMinor: 1250, currency: "EUR", category: "Food", convCurrency: null, convAmountMinor: null }] };
    expect(computeBudget(input)).toMatchObject({ remainingMinor: -250, actualMinor: 1250, projectedMinor: 0 });
    expect(computeBudget({ ...input, budgetMinor: null }).remainingMinor).toBeNull();
    expect(computeBudget({ ...input, budgetMinor: 0 }).remainingMinor).toBe(-1250);
  });
});
