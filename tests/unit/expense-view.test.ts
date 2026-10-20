import { describe, expect, it } from "vitest";
import { arrangeExpenses, type ExpenseRow } from "@/lib/expense-view";

const rows: ExpenseRow[] = [
  { id: "1", description: "Dinner", category: "Food & drink", amountMinor: 8000, currency: "EUR", date: "2026-06-02", createdAt: "2026-06-02T20:00:00Z" },
  { id: "2", description: "Museum", category: "Activities", amountMinor: 3000, currency: "EUR", date: "2026-06-01", createdAt: "2026-06-03T09:00:00Z" },
  { id: "3", description: "Coffee", category: "Food & drink", amountMinor: 900, currency: "EUR", date: "2026-06-01", createdAt: "2026-06-01T08:00:00Z" },
  { id: "4", description: "Taxi", category: "Transport", amountMinor: 2500, currency: "USD", date: "2026-06-02", createdAt: "2026-06-02T10:00:00Z" },
];

describe("arrangeExpenses", () => {
  it("global sort when ungrouped", () => {
    expect(arrangeExpenses(rows, "amount_desc", "none")[0].items.map((r) => r.id)).toEqual(["1", "2", "4", "3"]);
    expect(arrangeExpenses(rows, "created_asc", "none")[0].items.map((r) => r.id)).toEqual(["3", "4", "1", "2"]);
    expect(arrangeExpenses(rows, "date_asc", "none")[0].items.map((r) => r.id)).toEqual(["3", "2", "4", "1"]);
  });
  it("sorts within day groups and computes per-currency subtotals", () => {
    const g = arrangeExpenses(rows, "amount_asc", "day");
    expect(g.map((x) => x.key)).toEqual(["2026-06-02", "2026-06-01"]);
    expect(g[1].items.map((r) => r.id)).toEqual(["3", "2"]);
    expect(g[0].subtotals).toEqual([{ currency: "EUR", amountMinor: 8000 }, { currency: "USD", amountMinor: 2500 }]);
  });
  it("groups by category", () => {
    const g = arrangeExpenses(rows, "created_desc", "category");
    expect(g.map((x) => x.key)).toEqual(["Activities", "Food & drink", "Transport"]);
    expect(g[1].items.map((r) => r.id)).toEqual(["1", "3"]);
    expect(g[1].subtotals).toEqual([{ currency: "EUR", amountMinor: 8900 }]);
  });
});
