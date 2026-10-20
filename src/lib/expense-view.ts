// Sorting and grouping for the expense list (pure, shared by server and client).

export type ExpenseRow = { id: string; description: string; category: string; amountMinor: number; currency: string; date: string; createdAt: string };
export type SortKey = "created_desc" | "created_asc" | "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "category";
export type GroupKey = "none" | "day" | "category";

export type ExpenseGroup<T> = { key: string; label: string; items: T[]; subtotals: { currency: string; amountMinor: number }[] };

const cmp: Record<SortKey, (a: ExpenseRow, b: ExpenseRow) => number> = {
  created_desc: (a, b) => b.createdAt.localeCompare(a.createdAt),
  created_asc: (a, b) => a.createdAt.localeCompare(b.createdAt),
  date_desc: (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  date_asc: (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  amount_desc: (a, b) => b.amountMinor - a.amountMinor || b.createdAt.localeCompare(a.createdAt),
  amount_asc: (a, b) => a.amountMinor - b.amountMinor || a.createdAt.localeCompare(b.createdAt),
  category: (a, b) => a.category.localeCompare(b.category) || b.createdAt.localeCompare(a.createdAt),
};

/** Subtotals are per currency: different currencies are never added together. */
export function subtotals(items: ExpenseRow[]) {
  const m = new Map<string, number>();
  for (const e of items) m.set(e.currency, (m.get(e.currency) ?? 0) + e.amountMinor);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

export function arrangeExpenses<T extends ExpenseRow>(rows: T[], sort: SortKey, group: GroupKey, dayLabel: (d: string) => string = (d) => d): ExpenseGroup<T>[] {
  const sorted = [...rows].sort(cmp[sort] ?? cmp.created_desc);
  if (group === "none") return [{ key: "all", label: "All expenses", items: sorted, subtotals: subtotals(sorted) }];
  const keyOf = (e: T) => (group === "day" ? e.date : e.category);
  const groups = new Map<string, T[]>();
  for (const e of sorted) {
    const k = keyOf(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  // Groups themselves are ordered chronologically (newest day first) or alphabetically; items keep the chosen sort.
  const keys = [...groups.keys()].sort((a, b) => (group === "day" ? b.localeCompare(a) : a.localeCompare(b)));
  return keys.map((k) => ({ key: k, label: group === "day" ? dayLabel(k) : k, items: groups.get(k)!, subtotals: subtotals(groups.get(k)!) }));
}
