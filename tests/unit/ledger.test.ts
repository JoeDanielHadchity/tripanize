import { describe, expect, it } from "vitest";
import { buildLedger, computeShares, SplitError, type LedgerExpense } from "@/server/expenses/ledger";

const sum = (xs: { amountMinor: number }[]) => xs.reduce((a, b) => a + b.amountMinor, 0);

describe("computeShares", () => {
  it("equal split across three travelers keeps the exact total", () => {
    const s = computeShares({ method: "EQUAL", amountMinor: 10000, participants: [{ travelerId: "a" }, { travelerId: "b" }, { travelerId: "c" }] });
    expect(sum(s)).toBe(10000);
    expect(s.map((x) => x.amountMinor)).toEqual([3334, 3333, 3333]);
  });
  it("custom percentages must total 100%", () => {
    const s = computeShares({ method: "PERCENT", amountMinor: 999, participants: [{ travelerId: "a", value: 5000 }, { travelerId: "b", value: 2500 }, { travelerId: "c", value: 2500 }] });
    expect(sum(s)).toBe(999);
    expect(s.map((x) => x.amountMinor)).toEqual([499, 250, 250]);
    expect(() => computeShares({ method: "PERCENT", amountMinor: 100, participants: [{ travelerId: "a", value: 5000 }, { travelerId: "b", value: 4000 }] })).toThrow(/90.00%/);
  });
  it("custom amounts must equal the expense total", () => {
    const s = computeShares({ method: "AMOUNT", amountMinor: 5000, participants: [{ travelerId: "a", value: 1000 }, { travelerId: "b", value: 4000 }] });
    expect(s.map((x) => x.amountMinor)).toEqual([1000, 4000]);
    expect(() => computeShares({ method: "AMOUNT", amountMinor: 5000, participants: [{ travelerId: "a", value: 1000 }, { travelerId: "b", value: 3999 }] })).toThrow(SplitError);
  });
  it("selected participants only", () => {
    const s = computeShares({ method: "EQUAL", amountMinor: 3000, participants: [{ travelerId: "b" }, { travelerId: "c" }] });
    expect(s).toEqual([{ travelerId: "b", amountMinor: 1500, percentBp: null }, { travelerId: "c", amountMinor: 1500, percentBp: null }]);
  });
  it("paid entirely for one person", () => {
    expect(computeShares({ method: "SINGLE", amountMinor: 2500, participants: [{ travelerId: "c" }] })).toEqual([{ travelerId: "c", amountMinor: 2500, percentBp: null }]);
    expect(() => computeShares({ method: "SINGLE", amountMinor: 2500, participants: [{ travelerId: "a" }, { travelerId: "b" }] })).toThrow();
  });
  it("rejects zero, negative and duplicate participants", () => {
    expect(() => computeShares({ method: "EQUAL", amountMinor: 0, participants: [{ travelerId: "a" }] })).toThrow();
    expect(() => computeShares({ method: "EQUAL", amountMinor: 100, participants: [{ travelerId: "a" }, { travelerId: "a" }] })).toThrow();
  });
});

function exp(id: string, payerId: string, amountMinor: number, ids: string[], currency = "EUR", category = "Food & drink"): LedgerExpense {
  const shares = computeShares({ method: "EQUAL", amountMinor, participants: ids.map((travelerId) => ({ travelerId })) });
  return { id, payerId, amountMinor, currency, category, shares };
}

describe("buildLedger", () => {
  const people = ["ana", "ben", "cy"];

  it("computes balances, contributions and suggestions for three travelers", () => {
    const l = buildLedger(people, [exp("1", "ana", 9000, people), exp("2", "ben", 3000, people)], []);
    expect(l).toHaveLength(1);
    const eur = l[0];
    expect(eur.totalSpent).toBe(12000);
    const p = Object.fromEntries(eur.people.map((x) => [x.travelerId, x]));
    expect(p.ana.balance).toBe(5000);
    expect(p.ben.balance).toBe(-1000);
    expect(p.cy.balance).toBe(-4000);
    expect(p.ana.paidForOthers).toBe(6000);
    expect(eur.people.reduce((a, x) => a + x.balance, 0)).toBe(0);
    expect(eur.suggestions).toEqual([
      { fromId: "cy", toId: "ana", amountMinor: 4000 },
      { fromId: "ben", toId: "ana", amountMinor: 1000 },
    ]);
  });

  it("partial and complete settlements reduce balances without adding spending", () => {
    const expenses = [exp("1", "ana", 9000, people)];
    const partial = buildLedger(people, expenses, [{ fromId: "ben", toId: "ana", amountMinor: 1000, currency: "EUR" }])[0];
    const p1 = Object.fromEntries(partial.people.map((x) => [x.travelerId, x]));
    expect(partial.totalSpent).toBe(9000);
    expect(p1.ben.balance).toBe(-2000);
    expect(p1.ana.balance).toBe(5000);
    expect(p1.ben.contribution).toBe(1000);
    expect(p1.ana.contribution).toBe(8000);

    const full = buildLedger(people, expenses, [
      { fromId: "ben", toId: "ana", amountMinor: 1000, currency: "EUR" },
      { fromId: "ben", toId: "ana", amountMinor: 2000, currency: "EUR" },
      { fromId: "cy", toId: "ana", amountMinor: 3000, currency: "EUR" },
    ])[0];
    expect(full.totalSpent).toBe(9000);
    expect(full.people.every((x) => x.balance === 0)).toBe(true);
    expect(full.people.map((x) => x.contribution)).toEqual([3000, 3000, 3000]);
    expect(full.suggestions).toEqual([]);
    // Final contributions always add up to total spending.
    expect(full.people.reduce((a, x) => a + x.contribution, 0)).toBe(full.totalSpent);
  });

  it("keeps currencies separate and never sums across them", () => {
    const l = buildLedger(people, [exp("1", "ana", 3000, people, "EUR"), exp("2", "ben", 6000, people, "USD")], []);
    expect(l.map((x) => [x.currency, x.totalSpent])).toEqual([["EUR", 3000], ["USD", 6000]]);
    const usd = l.find((x) => x.currency === "USD")!;
    expect(usd.people.find((x) => x.travelerId === "ana")!.balance).toBe(-2000);
  });

  it("uses an explicitly chosen conversion rate and keeps shares exact", () => {
    const e = exp("1", "ana", 10000, ["ana", "ben", "cy"], "USD");
    e.conversion = { currency: "EUR", rate: "0.9" };
    const [eur] = buildLedger(people, [e], []);
    expect(eur.currency).toBe("EUR");
    expect(eur.totalSpent).toBe(9000);
    expect(eur.people.reduce((a, x) => a + x.share, 0)).toBe(9000);
  });

  it("reflects edits and deletions when rebuilt from current records", () => {
    const before = buildLedger(people, [exp("1", "ana", 9000, people)], [])[0];
    const after = buildLedger(people, [exp("1", "ana", 6000, people)], [])[0];
    const deleted = buildLedger(people, [], []);
    expect(before.totalSpent).toBe(9000);
    expect(after.people.find((p) => p.travelerId === "ana")!.balance).toBe(4000);
    expect(deleted).toEqual([]);
  });

  it("tracks spending by category", () => {
    const [eur] = buildLedger(people, [exp("1", "ana", 1000, people, "EUR", "Transport"), exp("2", "ana", 500, people, "EUR", "Transport"), exp("3", "ben", 200, people)], []);
    expect(eur.byCategory).toEqual({ Transport: 1500, "Food & drink": 200 });
  });
});
