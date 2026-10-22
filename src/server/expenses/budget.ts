/**
 * Actual spending and the plan's estimates are independent totals:
 *  - Only recorded expenses reduce the remaining budget.
 *  - Booking estimates stay in the plan even after their payments are recorded.
 *  - Settlements are repayments, never spending.
 *  - A booking projected into the itinerary is counted as a booking, not as an itinerary stop.
 *  - Only the Plan A of each day counts; Plan B alternatives are excluded. Skipped stops are excluded.
 *  - Amounts in other currencies are listed separately, never silently added.
 */
export type BudgetInput = {
  currency: string;
  budgetMinor: number | null;
  stops: { plan: string; status: string; bookingId: string | null; estCostMinor: number | null; currency: string | null }[];
  bookings: { id: string; status: string; estCostMinor: number | null; finalCostMinor: number | null; currency: string; hasExpense: boolean }[];
  expenses: { amountMinor: number; currency: string; category: string; convCurrency: string | null; convAmountMinor: number | null }[];
};

export type BudgetSummary = {
  currency: string;
  budgetMinor: number | null;
  actualMinor: number;
  estimatedBookingsMinor: number;
  committedBookingsMinor: number;
  plannedBookingsMinor: number;
  plannedActivitiesMinor: number;
  projectedMinor: number;
  remainingMinor: number | null;
  actualByCategory: Record<string, number>;
  otherCurrencies: { currency: string; actualMinor: number; estimatedMinor: number }[];
};

export function computeBudget(input: BudgetInput): BudgetSummary {
  const cur = input.currency;
  const other = new Map<string, { actualMinor: number; estimatedMinor: number }>();
  const addOther = (c: string, k: "actualMinor" | "estimatedMinor", v: number) => {
    const o = other.get(c) ?? { actualMinor: 0, estimatedMinor: 0 };
    o[k] += v;
    other.set(c, o);
  };

  let actual = 0;
  const byCat: Record<string, number> = {};
  for (const e of input.expenses) {
    const amount = e.currency === cur ? e.amountMinor : e.convCurrency === cur ? e.convAmountMinor : null;
    if (amount === null) {
      addOther(e.currency, "actualMinor", e.amountMinor);
      continue;
    }
    actual += amount;
    byCat[e.category] = (byCat[e.category] ?? 0) + amount;
  }

  let committed = 0;
  let plannedBookings = 0;
  let estimatedBookings = 0;
  for (const b of input.bookings) {
    if (b.status === "CANCELLED") continue;
    const confirmed = b.status === "BOOKED" || b.status === "PAID";
    const estimate = b.estCostMinor ?? 0;
    if (b.currency !== cur) {
      if (estimate) addOther(b.currency, "estimatedMinor", estimate);
      continue;
    }
    estimatedBookings += estimate;
    if (confirmed && !b.hasExpense) committed += b.finalCostMinor ?? estimate;
    if (!confirmed) plannedBookings += estimate;
  }

  let plannedActivities = 0;
  for (const s of input.stops) {
    if (s.plan !== "A" || s.status === "SKIPPED" || s.bookingId || !s.estCostMinor) continue;
    if (s.currency && s.currency !== cur) {
      addOther(s.currency, "estimatedMinor", s.estCostMinor);
      continue;
    }
    plannedActivities += s.estCostMinor;
  }

  const projected = estimatedBookings + plannedActivities;
  return {
    currency: cur,
    budgetMinor: input.budgetMinor,
    actualMinor: actual,
    estimatedBookingsMinor: estimatedBookings,
    committedBookingsMinor: committed,
    plannedBookingsMinor: plannedBookings,
    plannedActivitiesMinor: plannedActivities,
    projectedMinor: projected,
    remainingMinor: input.budgetMinor === null ? null : input.budgetMinor - actual,
    actualByCategory: byCat,
    otherCurrencies: [...other.entries()].map(([currency, v]) => ({ currency, ...v })),
  };
}
