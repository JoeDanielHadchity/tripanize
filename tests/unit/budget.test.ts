import { describe, expect, it } from "vitest";
import { computeBudget } from "@/server/expenses/budget";

describe("computeBudget", () => {
  it("avoids double counting bookings, plan B, settlements and other currencies", () => {
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
        { id: "b1", status: "PAID", estCostMinor: 40000, finalCostMinor: 42000, currency: "EUR", hasExpense: true }, // counted as expense only
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
    expect(b.projectedMinor).toBe(62840);
    expect(b.remainingMinor).toBe(200000 - 62840);
    expect(b.otherCurrencies).toEqual([{ currency: "USD", actualMinor: 1000, estimatedMinor: 5000 }]);
  });
});
