import { allocate, convertMinor } from "@/lib/money";

export type SplitMethod = "EQUAL" | "PERCENT" | "AMOUNT" | "SINGLE";

export type SplitInput = {
  method: SplitMethod;
  amountMinor: number;
  /** For PERCENT: value is basis points (100% = 10000). For AMOUNT: value is minor units. */
  participants: { travelerId: string; value?: number }[];
};

export type ShareResult = { travelerId: string; amountMinor: number; percentBp: number | null }[];

export class SplitError extends Error {}

export function computeShares(input: SplitInput): ShareResult {
  const { method, amountMinor } = input;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new SplitError("Amount must be greater than zero.");
  const ids = input.participants.map((p) => p.travelerId);
  if (ids.length === 0) throw new SplitError("Choose at least one person to split with.");
  if (new Set(ids).size !== ids.length) throw new SplitError("Each person can appear only once in a split.");

  switch (method) {
    case "EQUAL": {
      const parts = allocate(amountMinor, ids.map(() => 1));
      return ids.map((travelerId, i) => ({ travelerId, amountMinor: parts[i], percentBp: null }));
    }
    case "SINGLE": {
      if (ids.length !== 1) throw new SplitError("“Paid for one person” needs exactly one person.");
      return [{ travelerId: ids[0], amountMinor, percentBp: null }];
    }
    case "PERCENT": {
      const bps = input.participants.map((p) => p.value ?? NaN);
      if (bps.some((b) => !Number.isInteger(b) || b < 0)) throw new SplitError("Percentages must be numbers with at most two decimals.");
      const sum = bps.reduce((a, b) => a + b, 0);
      if (sum !== 10000) throw new SplitError(`Percentages add up to ${(sum / 100).toFixed(2)}%, not 100%.`);
      const parts = allocate(amountMinor, bps);
      return ids.map((travelerId, i) => ({ travelerId, amountMinor: parts[i], percentBp: bps[i] }));
    }
    case "AMOUNT": {
      const vals = input.participants.map((p) => p.value ?? NaN);
      if (vals.some((v) => !Number.isSafeInteger(v) || v < 0)) throw new SplitError("Each share must be a valid amount.");
      const sum = vals.reduce((a, b) => a + b, 0);
      if (sum !== amountMinor) throw new SplitError(`Shares add up to ${sum} but the expense is ${amountMinor} (in minor units). They must match exactly.`);
      return ids.map((travelerId, i) => ({ travelerId, amountMinor: vals[i], percentBp: null }));
    }
    default:
      throw new SplitError("Unknown split method.");
  }
}

export type LedgerExpense = {
  id: string;
  amountMinor: number;
  currency: string;
  category: string;
  payerId: string;
  shares: { travelerId: string; amountMinor: number }[];
  conversion?: { currency: string; rate: string } | null;
};

export type LedgerSettlement = { fromId: string; toId: string; amountMinor: number; currency: string };

export type PersonSummary = {
  travelerId: string;
  /** Total of expenses this person originally paid at the till. */
  paid: number;
  /** This person's share of all expenses (what they "consumed"). */
  share: number;
  /** Part of what they paid that covered other people's shares. */
  paidForOthers: number;
  repaymentsSent: number;
  repaymentsReceived: number;
  /** What they ultimately contributed after repayments: paid + sent − received. */
  contribution: number;
  /** Positive: others owe them. Negative: they owe others. */
  balance: number;
};

export type CurrencyLedger = {
  currency: string;
  totalSpent: number;
  byCategory: Record<string, number>;
  people: PersonSummary[];
  suggestions: { fromId: string; toId: string; amountMinor: number }[];
};

/** Normalizes an expense into the currency it is accounted in (explicit conversion only). */
function accounted(e: LedgerExpense): { currency: string; amount: number; shares: { travelerId: string; amountMinor: number }[] } {
  if (!e.conversion) return { currency: e.currency, amount: e.amountMinor, shares: e.shares };
  const amount = convertMinor(e.amountMinor, e.currency, e.conversion.currency, e.conversion.rate);
  const parts = allocate(amount, e.shares.map((s) => s.amountMinor));
  return { currency: e.conversion.currency, amount, shares: e.shares.map((s, i) => ({ travelerId: s.travelerId, amountMinor: parts[i] })) };
}

export function buildLedger(travelerIds: string[], expenses: LedgerExpense[], settlements: LedgerSettlement[]): CurrencyLedger[] {
  const byCur = new Map<string, CurrencyLedger>();
  const ensure = (currency: string) => {
    let l = byCur.get(currency);
    if (!l) {
      l = {
        currency,
        totalSpent: 0,
        byCategory: {},
        people: travelerIds.map((travelerId) => ({ travelerId, paid: 0, share: 0, paidForOthers: 0, repaymentsSent: 0, repaymentsReceived: 0, contribution: 0, balance: 0 })),
        suggestions: [],
      };
      byCur.set(currency, l);
    }
    return l;
  };
  const person = (l: CurrencyLedger, id: string) => {
    let p = l.people.find((x) => x.travelerId === id);
    if (!p) {
      p = { travelerId: id, paid: 0, share: 0, paidForOthers: 0, repaymentsSent: 0, repaymentsReceived: 0, contribution: 0, balance: 0 };
      l.people.push(p);
    }
    return p;
  };

  for (const raw of expenses) {
    const e = accounted(raw);
    const l = ensure(e.currency);
    l.totalSpent += e.amount;
    l.byCategory[raw.category] = (l.byCategory[raw.category] ?? 0) + e.amount;
    const payer = person(l, raw.payerId);
    payer.paid += e.amount;
    const ownShare = e.shares.find((s) => s.travelerId === raw.payerId)?.amountMinor ?? 0;
    payer.paidForOthers += e.amount - ownShare;
    for (const s of e.shares) person(l, s.travelerId).share += s.amountMinor;
  }
  for (const s of settlements) {
    const l = ensure(s.currency);
    person(l, s.fromId).repaymentsSent += s.amountMinor;
    person(l, s.toId).repaymentsReceived += s.amountMinor;
  }
  for (const l of byCur.values()) {
    for (const p of l.people) {
      p.contribution = p.paid + p.repaymentsSent - p.repaymentsReceived;
      p.balance = p.paid - p.share + p.repaymentsSent - p.repaymentsReceived;
    }
    l.suggestions = suggestSettlements(l.people.map((p) => ({ id: p.travelerId, balance: p.balance })));
  }
  return [...byCur.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Greedy largest-debtor-to-largest-creditor matching; at most n−1 transfers, deterministic. */
export function suggestSettlements(balances: { id: string; balance: number }[]) {
  const creditors = balances.filter((b) => b.balance > 0).map((b) => ({ ...b }));
  const debtors = balances.filter((b) => b.balance < 0).map((b) => ({ id: b.id, balance: -b.balance }));
  const sort = (arr: { id: string; balance: number }[]) => arr.sort((a, b) => b.balance - a.balance || a.id.localeCompare(b.id));
  const out: { fromId: string; toId: string; amountMinor: number }[] = [];
  sort(creditors);
  sort(debtors);
  while (creditors.length && debtors.length) {
    const c = creditors[0];
    const d = debtors[0];
    const amt = Math.min(c.balance, d.balance);
    if (amt > 0) out.push({ fromId: d.id, toId: c.id, amountMinor: amt });
    c.balance -= amt;
    d.balance -= amt;
    if (c.balance === 0) creditors.shift();
    if (d.balance === 0) debtors.shift();
    sort(creditors);
    sort(debtors);
  }
  return out;
}
