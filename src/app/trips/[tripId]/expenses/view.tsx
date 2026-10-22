"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, EmptyState, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui";
import { ReceiptImport } from "@/components/receipt-import";
import type { ReceiptDraft } from "@/server/expenses/receipt";
import { Dialog, useAction, useConfirm } from "@/components/client";
import { deleteExpenseAction, deleteSettlementAction, recordSettlementAction, saveExpenseAction } from "@/app/actions/expenses";
import { arrangeExpenses, type GroupKey, type SortKey } from "@/lib/expense-view";
import { allocate, CURRENCIES, formatMoney, minorToDecimalString, parseMoney } from "@/lib/money";
import { formatDate, formatTimestamp, zonedToUtc } from "@/lib/dates";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import type { CurrencyLedger } from "@/server/expenses/ledger";
import type { BudgetSummary } from "@/server/expenses/budget";

type Traveler = { id: string; name: string; active: boolean };
type Expense = {
  id: string; version: number; description: string; category: string; amountMinor: number; currency: string; date: string; createdAt: string; payerId: string; splitMethod: "EQUAL" | "PERCENT" | "AMOUNT" | "SINGLE";
  notes: string | null; bookingId: string | null; bookingTitle: string | null; shares: { travelerId: string; amountMinor: number; percentBp: number | null }[];
  conversion: { currency: string; rate: string; rateDate: string; amountMinor: number } | null;
};
type Settlement = { id: string; fromId: string; toId: string; amountMinor: number; currency: string; paidAt: string; note: string | null };
type Prefill = { bookingId: string; description: string; amountMinor: number | null; currency: string; category: string; date: string | null };

type Props = {
  tripId: string; canEdit: boolean; aiReady: boolean; tripCurrency: string; timezone: string; today: string; meId: string | null; travelers: Traveler[]; expenses: Expense[]; settlements: Settlement[];
  ledger: CurrencyLedger[]; budget: BudgetSummary; audit: { id: string; at: string; actor: string | null; entity: string; action: string; before: unknown; after: unknown }[];
  bookings: { id: string; title: string; hasExpense: boolean }[]; prefill: Prefill | null;
};

export function ExpensesView(p: Props) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const name = (id: string) => p.travelers.find((t) => t.id === id)?.name ?? "Former traveler";
  const [sort, setSort] = useState<SortKey>("created_desc");
  const [group, setGroup] = useState<GroupKey>("day");
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptDraft | null>(null);
  const [receiptKey, setReceiptKey] = useState(0);
  const [settle, setSettle] = useState<{ fromId?: string; toId?: string; amountMinor?: number; currency?: string } | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("tripanize:exp-sort") as SortKey | null;
      const g = localStorage.getItem("tripanize:exp-group") as GroupKey | null;
      if (s) setSort(s);
      if (g) setGroup(g);
    } catch {
      /* ignore */
    }
    if (p.prefill) setEditing("new");
  }, [p.prefill]);
  const persist = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

  const groups = useMemo(() => arrangeExpenses(p.expenses, sort, group, (d) => formatDate(d, { weekday: "short", day: "numeric", month: "short" })), [p.expenses, sort, group]);
  const anyBalance = p.ledger.some((l) => l.suggestions.length > 0);

  return (
    <div className="space-y-6">
      <BudgetCard b={p.budget} tripId={p.tripId} canEdit={p.canEdit} />

      <section aria-labelledby="actual-spending-h" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="actual-spending-h" className="font-display text-xl font-semibold">Actual spending</h2>
        <div className="flex flex-wrap gap-2">
        {p.canEdit && <Button variant="primary" onClick={() => { setReceipt(null); setEditing("new"); }}>+ Add expense</Button>}
        {p.canEdit && p.aiReady && <Button onClick={() => setImporting(true)}>Import receipt</Button>}
        {p.canEdit && <Button variant={anyBalance ? "sage" : "secondary"} className="font-semibold" onClick={() => setSettle({})}>Settle up</Button>}
        </div>
      </div>
      {p.budget.committedBookingsMinor > 0 && <Notice>Booked items awaiting an expense: {formatMoney(p.budget.committedBookingsMinor, p.tripCurrency)}. <Link href={`/trips/${p.tripId}/bookings`} className="font-medium underline">Record their payments</Link> to include them in actual spending.</Notice>}

      {p.ledger.length === 0 ? (
        <EmptyState title="No expenses yet" action={p.canEdit ? <Button variant="primary" onClick={() => { setReceipt(null); setEditing("new"); }}>Add the first expense</Button> : undefined}>Record who paid and who it was for. Tripanize works out who owes whom — exactly, to the cent.</EmptyState>
      ) : (
        p.ledger.map((l) => (
          <section key={l.currency} aria-labelledby={`led-${l.currency}`} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`led-${l.currency}`} className="font-display text-lg font-semibold">{l.currency} balances</h2>
              <p className="text-sm">Total trip spending: <strong>{formatMoney(l.totalSpent, l.currency)}</strong> <span className="text-muted">(repayments not included)</span></p>
            </div>
            {l.suggestions.length > 0 ? (
              <Card className="bg-sage-soft/50">
                <h3 className="text-sm font-semibold">Who owes whom</h3>
                <p className="mt-1 text-xs text-muted">A simple way to settle the group’s balances. Record a repayment after it has been paid.</p>
                <ul className="mt-2 space-y-2">
                  {l.suggestions.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span><strong>{name(s.fromId)}</strong> owes <strong>{name(s.toId)}</strong> <strong>{formatMoney(s.amountMinor, l.currency)}</strong></span>
                      {p.canEdit && <Button className="min-h-10" onClick={() => setSettle({ fromId: s.fromId, toId: s.toId, amountMinor: s.amountMinor, currency: l.currency })}>Record repayment</Button>}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : <p className="text-sm text-sage-ink">✓ Everyone is settled up in {l.currency}.</p>}
            <details>
              <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-muted">Detailed contributions & balances</summary>
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[40rem] text-sm">
                <caption className="sr-only">Contributions and balances in {l.currency}</caption>
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-3 py-2 font-medium">Traveler</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium" title="Total of expenses they paid at the till">Originally paid</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium" title="Part of what they paid that covered other people">…for others</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium" title="Their share of all expenses">Their share</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Repaid</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Received</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium" title="Originally paid + repayments sent − repayments received">Final contribution</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {l.people.filter((x) => x.paid || x.share || x.repaymentsSent || x.repaymentsReceived).map((x) => (
                    <tr key={x.travelerId} className="border-b border-line last:border-0">
                      <th scope="row" className="px-3 py-2 text-left font-medium">{name(x.travelerId)}{x.travelerId === p.meId ? " (you)" : ""}</th>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(x.paid, l.currency)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{formatMoney(x.paidForOthers, l.currency)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(x.share, l.currency)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{formatMoney(x.repaymentsSent, l.currency)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{formatMoney(x.repaymentsReceived, l.currency)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(x.contribution, l.currency)}</td>
                      <td className={cx("px-3 py-2 text-right tabular-nums font-semibold", x.balance > 0 ? "text-sage-ink" : x.balance < 0 ? "text-danger" : "text-muted")}>
                        {x.balance === 0 ? "settled" : x.balance > 0 ? `gets ${formatMoney(x.balance, l.currency)}` : `owes ${formatMoney(-x.balance, l.currency)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted"><strong>Originally paid</strong> is what someone paid at the till. <strong>Final contribution</strong> is what they've actually put in after repayments. When everyone is settled, final contribution equals their share.</p>
            </details>
            {Object.keys(l.byCategory).length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">Spending by category</summary>
                <ul className="mt-2 space-y-1">
                  {Object.entries(l.byCategory).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
                    <li key={c} className="flex items-center gap-3">
                      <span className="w-32 shrink-0">{c}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full bg-accent" style={{ width: `${Math.round((v / l.totalSpent) * 100)}%` }} /></span>
                      <span className="w-28 text-right tabular-nums">{formatMoney(v, l.currency)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        ))
      )}

      {p.expenses.length > 0 && (
        <section aria-labelledby="exp-list" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="exp-list" className="font-display text-lg font-semibold">All expenses</h2>
            <div className="flex flex-wrap gap-2">
              <label className="text-sm"><span className="mb-1 block text-xs text-muted">Sort</span>
                <Select value={sort} onChange={(e) => { setSort(e.target.value as SortKey); persist("tripanize:exp-sort", e.target.value); }} className="w-auto">
                  <option value="created_desc">Newest entered</option>
                  <option value="created_asc">Oldest entered</option>
                  <option value="date_desc">Expense date (newest)</option>
                  <option value="date_asc">Expense date (oldest)</option>
                  <option value="amount_desc">Amount (high → low)</option>
                  <option value="amount_asc">Amount (low → high)</option>
                  <option value="category">Category</option>
                </Select>
              </label>
              <label className="text-sm"><span className="mb-1 block text-xs text-muted">Group</span>
                <Select value={group} onChange={(e) => { setGroup(e.target.value as GroupKey); persist("tripanize:exp-group", e.target.value); }} className="w-auto">
                  <option value="day">By day</option>
                  <option value="category">By category</option>
                  <option value="none">No grouping</option>
                </Select>
              </label>
            </div>
          </div>
          {groups.map((g) => (
            <div key={g.key} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <h3 className="flex items-center justify-between gap-3 border-b border-line bg-surface-2/60 px-4 py-2 text-sm font-semibold">
                <span>{g.label}</span>
                <span className="text-right tabular-nums">{g.subtotals.map((s) => formatMoney(s.amountMinor, s.currency)).join(" · ")}</span>
              </h3>
              <ul className="divide-y divide-line">
                {g.items.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{e.description}</p>
                      <p className="text-xs text-muted">
                        {formatDate(e.date)} · {e.category} · paid by {name(e.payerId)} · {splitSummary(e, name)}
                        {e.bookingTitle ? ` · booking: ${e.bookingTitle}` : ""}
                      </p>
                      <p className="text-xs text-muted">Entered {formatTimestamp(e.createdAt, p.timezone)}</p>
                      {e.conversion && <p className="text-xs text-muted">Counted as {formatMoney(e.conversion.amountMinor, e.conversion.currency)} at {e.conversion.rate} ({e.conversion.rateDate}, your rate)</p>}
                      {e.notes && <p className="text-xs">{e.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="mr-2 font-semibold tabular-nums">{formatMoney(e.amountMinor, e.currency)}</span>
                      {p.canEdit && <Button className="min-h-10 px-3" onClick={() => setEditing(e)} aria-label={`Edit ${e.description}`}>Edit</Button>}
                      {p.canEdit && <Button className="min-h-10 px-3" variant="ghost" aria-label={`Delete ${e.description}`} onClick={async () => { if (await confirm({ title: "Delete expense?", message: `Delete “${e.description}” (${formatMoney(e.amountMinor, e.currency)})? Balances will update. The change is kept in the history below.`, danger: true, confirmLabel: "Delete" })) run(() => deleteExpenseAction(p.tripId, e.id), { success: "Expense deleted" }); }}>✕</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      </section>

      <PlannedSpendingCard b={p.budget} />

      <section aria-labelledby="rep" className="space-y-2">
        <h2 id="rep" className="font-display text-lg font-semibold">Repayments</h2>
        <p className="text-xs text-muted">Recorded repayments reduce balances. They are not spending and aren't included in totals or subtotals. Tripanize doesn't move money.</p>
        {p.settlements.length === 0 ? <p className="text-sm text-muted">None recorded yet.</p> : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {p.settlements.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span><strong>{name(s.fromId)}</strong> → <strong>{name(s.toId)}</strong> · {formatTimestamp(s.paidAt, p.timezone)}{s.note ? ` · ${s.note}` : ""}</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{formatMoney(s.amountMinor, s.currency)}</span>
                  {p.canEdit && <Button className="min-h-10 px-3" variant="ghost" onClick={async () => { if (await confirm({ title: "Remove repayment record?", message: "Use this if the repayment was recorded by mistake. Balances will go back up.", danger: true, confirmLabel: "Remove" })) run(() => deleteSettlementAction(p.tripId, s.id), { success: "Repayment removed" }); }}>Remove</Button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {p.audit.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Change history</summary>
          <ul className="mt-2 space-y-1 text-muted">
            {p.audit.map((a) => <li key={a.id}>{formatTimestamp(a.at, p.timezone)} — {a.actor ?? "Someone"} {a.action}d {a.entity === "settlement" ? "a repayment" : "an expense"}{describeAudit(a.before, a.after)}</li>)}
          </ul>
        </details>
      )}

      {importing && <ReceiptImport tripId={p.tripId} open onClose={() => setImporting(false)} onRead={draft => { setImporting(false); setReceipt(draft); setReceiptKey(k => k + 1); setEditing("new"); }} />}
      <ExpenseDialog {...p} receipt={editing === "new" ? receipt : null} key={editing === "new" ? `new-${receiptKey}` : editing?.id ?? "exp-none"} open={Boolean(editing)} expense={editing === "new" ? null : editing} prefill={editing === "new" ? p.prefill : null} onClose={() => { setEditing(null); setReceipt(null); }} />
      <SettleDialog {...p} key={settle ? JSON.stringify(settle) : "settle-none"} open={Boolean(settle)} initial={settle ?? {}} onClose={() => setSettle(null)} />
    </div>
  );
}

function describeAudit(before: unknown, after: unknown) {
  const b = before as { amountMinor?: number; currency?: string; description?: string } | null;
  const a = after as { amountMinor?: number; currency?: string; description?: string } | null;
  const d = a?.description ?? b?.description;
  if (b?.amountMinor !== undefined && a?.amountMinor !== undefined && b.amountMinor !== a.amountMinor) return ` “${d}”: ${formatMoney(b.amountMinor, b.currency ?? "EUR")} → ${formatMoney(a.amountMinor, a.currency ?? "EUR")}`;
  const x = a ?? b;
  return x?.amountMinor !== undefined ? ` ${d ? `“${d}” ` : ""}(${formatMoney(x.amountMinor, x.currency ?? "EUR")})` : "";
}

function splitSummary(e: Expense, name: (id: string) => string) {
  if (e.splitMethod === "SINGLE") return `for ${name(e.shares[0]?.travelerId)}`;
  if (e.splitMethod === "EQUAL") return `split equally (${e.shares.length})`;
  return e.shares.map((s) => `${name(s.travelerId)} ${formatMoney(s.amountMinor, e.currency)}`).join(", ");
}

function BudgetCard({ b, tripId, canEdit }: { b: BudgetSummary; tripId: string; canEdit: boolean }) {
  const over = b.remainingMinor !== null && b.remainingMinor < 0;
  const used = b.budgetMinor && b.budgetMinor > 0 ? Math.min(100, Math.max(0, b.actualMinor / b.budgetMinor * 100)) : null;
  const unconverted = b.otherCurrencies.filter(o => o.actualMinor > 0);
  return (
    <section aria-labelledby="budget-h" className="rounded-3xl border-2 border-accent bg-accent-soft p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="budget-h" className="font-display text-xl font-semibold">Trip budget</h2>
        {canEdit && <Link href={`/trips/${tripId}/settings#details`} className="text-sm font-medium text-accent-ink underline">{b.budgetMinor === null ? "Set budget" : "Edit budget"}</Link>}
      </div>
      <dl className="mt-5 grid gap-5 sm:grid-cols-3">
        <div><dt className="text-sm text-muted">Overall budget · {b.currency}</dt><dd className="mt-1 font-display text-3xl font-semibold tabular-nums">{b.budgetMinor === null ? "Not set" : formatMoney(b.budgetMinor, b.currency)}</dd></div>
        <div><dt className="text-sm text-muted">Actually spent</dt><dd className="mt-1 font-display text-3xl font-semibold tabular-nums">{formatMoney(b.actualMinor, b.currency)}</dd></div>
        <div><dt className="text-sm font-medium">{over ? "Over budget" : "Budget remaining"}</dt><dd className={cx("mt-1 font-display text-3xl font-semibold tabular-nums", over ? "text-danger" : "text-sage-ink")}>{b.remainingMinor === null ? "—" : formatMoney(Math.abs(b.remainingMinor), b.currency)}</dd></div>
      </dl>
      {used !== null && <div role="progressbar" aria-label="Trip budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used)} aria-valuetext={`${formatMoney(b.actualMinor, b.currency)} spent of ${formatMoney(b.budgetMinor!, b.currency)}`} className="mt-5 h-2.5 overflow-hidden rounded-full bg-surface"><div className={cx("h-full rounded-full transition-all", over ? "bg-danger" : "bg-accent")} style={{ width: `${used}%` }} /></div>}
      <p className="mt-3 text-sm text-muted">{b.budgetMinor === null ? "Set an overall budget to track what remains as you record expenses." : "Budget remaining = overall budget − actual expenses."}</p>
      {unconverted.length > 0 && <Notice tone="warn" className="mt-3">{unconverted.map(o => formatMoney(o.actualMinor, o.currency)).join(" · ")} in other currencies is not yet deducted. Edit those expenses and add a {b.currency} conversion to include them in this balance.</Notice>}
    </section>
  );
}

function PlannedSpendingCard({ b }: { b: BudgetSummary }) {
  const rows: [string, number, string][] = [
    ["Bookings already made", b.estimatedBookingsMinor - b.plannedBookingsMinor, "Estimates for booked or paid reservations"],
    ["Bookings still to make", b.plannedBookingsMinor, "Estimates for planned reservations"],
    ["Planned activities (Plan A)", b.plannedActivitiesMinor, "Estimates; excludes bookings, Plan B and skipped stops"],
  ];
  return (
    <section aria-labelledby="planned-spending-h">
      <Card>
        <h2 id="planned-spending-h" className="font-display text-lg font-semibold">Planned spending (estimates)</h2>
        <p className="mt-1 text-sm text-muted">The cost estimates from your itinerary and bookings. Adding or editing an expense leaves these estimates unchanged.</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          {rows.map(([k, v, hint]) => (
            <div key={k} className="flex justify-between gap-3"><dt>{k}<span className="block text-xs text-muted">{hint}</span></dt><dd className="tabular-nums">{formatMoney(v, b.currency)}</dd></div>
          ))}
          <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Estimated plan total · {b.currency}</dt><dd className="tabular-nums">{formatMoney(b.projectedMinor, b.currency)}</dd></div>
        </dl>
        {b.otherCurrencies.some(o => o.estimatedMinor > 0) && <p className="mt-2 text-xs text-muted">Other-currency estimates, shown separately: {b.otherCurrencies.filter(o => o.estimatedMinor > 0).map(o => formatMoney(o.estimatedMinor, o.currency)).join(" · ")}.</p>}
      </Card>
    </section>
  );
}

function ExpenseDialog({ open, expense, prefill, receipt, onClose, tripId, travelers, tripCurrency, today, meId, bookings }: Props & { open: boolean; receipt: ReceiptDraft | null; expense: Expense | null; onClose: () => void; prefill: Prefill | null }) {
  const { run, pending } = useAction();
  const active = travelers.filter((t) => t.active || expense?.shares.some((s) => s.travelerId === t.id) || expense?.payerId === t.id);
  const [currency, setCurrency] = useState(expense?.currency ?? receipt?.currency ?? prefill?.currency ?? tripCurrency);
  const [amount, setAmount] = useState(expense ? minorToDecimalString(expense.amountMinor, expense.currency) : receipt ? receipt.amount : prefill?.amountMinor ? minorToDecimalString(prefill.amountMinor, prefill.currency) : "");
  const [method, setMethod] = useState<Expense["splitMethod"]>(expense?.splitMethod ?? "EQUAL");
  const [selected, setSelected] = useState<string[]>(expense ? expense.shares.map((s) => s.travelerId) : active.filter((t) => t.active).map((t) => t.id));
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((expense?.shares ?? []).map((s) => [s.travelerId, s.percentBp !== null ? (s.percentBp / 100).toString() : minorToDecimalString(s.amountMinor, expense!.currency)])));
  const [single, setSingle] = useState(expense?.splitMethod === "SINGLE" ? expense.shares[0]?.travelerId : meId ?? active[0]?.id);
  const [convOn, setConvOn] = useState(Boolean(expense?.conversion));
  const [error, setError] = useState<string | null>(null);

  const total = parseMoney(amount, currency);
  const preview = useMemo(() => {
    if (!total) return null;
    if (method === "EQUAL" && selected.length) {
      const parts = allocate(total, selected.map(() => 1));
      return { ok: true, text: selected.map((id, i) => `${active.find((t) => t.id === id)?.name}: ${formatMoney(parts[i], currency)}`).join(" · ") };
    }
    if (method === "PERCENT") {
      const sum = selected.reduce((a, id) => a + (Number(values[id] || 0) || 0), 0);
      return { ok: Math.abs(sum - 100) < 0.001, text: `Total ${sum.toFixed(2)}% ${Math.abs(sum - 100) < 0.001 ? "✓" : "— must be 100%"}` };
    }
    if (method === "AMOUNT") {
      const sum = selected.reduce((a, id) => a + (parseMoney(values[id] || "0", currency) ?? 0), 0);
      return { ok: sum === total, text: `Assigned ${formatMoney(sum, currency)} of ${formatMoney(total, currency)}${sum === total ? " ✓" : ` — ${formatMoney(total - sum, currency)} left`}` };
    }
    return null;
  }, [total, method, selected, values, currency, active]);

  return (
    <Dialog open={open} onClose={onClose} title={expense ? "Edit expense" : receipt ? "Review receipt expense" : "Add expense"} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setError(null);
          const participants = method === "SINGLE" ? [{ travelerId: single! }] : selected.map((id) => ({ travelerId: id, value: method === "EQUAL" ? undefined : values[id] ?? "" }));
          const r = await run(() => saveExpenseAction(tripId, expense?.id ?? null, {
            description: String(f.get("description")), category: String(f.get("category")), amount, currency, date: String(f.get("date")), payerId: String(f.get("payer")), method, participants,
            notes: String(f.get("notes") || "") || null, bookingId: String(f.get("bookingId") || "") || null,
            conversion: convOn ? { currency: String(f.get("convCurrency")), rate: String(f.get("convRate")), rateDate: String(f.get("convDate")) } : null,
          }, expense?.version ?? 0), { success: expense ? "Expense updated" : "Expense added", onError: (r) => setError(r.error) });
          if (r !== null) onClose();
        }}
      >
        {receipt && <Notice tone="accent"><strong>Review before saving.</strong> Check the total, currency and date, then confirm who paid and everyone’s share. Nothing has been added to your spending yet.
          {receipt.warnings.length > 0 && <ul className="mt-2 list-disc pl-5">{receipt.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </Notice>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Description" htmlFor="e-desc" className="sm:col-span-2"><Input id="e-desc" name="description" required defaultValue={expense?.description ?? receipt?.description ?? prefill?.description ?? ""} maxLength={160} /></Field>
          <Field label="Amount" htmlFor="e-amount"><Input id="e-amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
          <Field label="Currency" htmlFor="e-cur"><Select id="e-cur" required value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="" disabled>Confirm currency</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Category" htmlFor="e-cat"><Select id="e-cat" name="category" defaultValue={expense?.category ?? receipt?.category ?? prefill?.category ?? "Food & drink"}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Expense date" htmlFor="e-date"><Input id="e-date" name="date" type="date" required defaultValue={expense?.date ?? receipt?.date ?? prefill?.date ?? today} /></Field>
          <Field label="Paid by" htmlFor="e-payer"><Select id="e-payer" name="payer" defaultValue={expense?.payerId ?? meId ?? active[0]?.id}>{active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Linked booking (optional)" htmlFor="e-book" hint="Connect this payment to its reservation. The booking estimate stays in planned spending."><Select id="e-book" name="bookingId" defaultValue={expense?.bookingId ?? prefill?.bookingId ?? ""}><option value="">None</option>{bookings.filter((b) => !b.hasExpense || b.id === expense?.bookingId || b.id === prefill?.bookingId).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</Select></Field>
        </div>

        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-medium">Split</legend>
          <div className="flex flex-wrap gap-2">
            {([["EQUAL", "Equally"], ["PERCENT", "By percentage"], ["AMOUNT", "By amount"], ["SINGLE", "For one person"]] as const).map(([m, l]) => (
              <label key={m} className={cx("flex min-h-10 cursor-pointer items-center rounded-lg border px-3 text-sm", method === m ? "border-accent bg-accent-soft text-accent-ink" : "border-line")}>
                <input type="radio" className="sr-only" checked={method === m} onChange={() => setMethod(m)} />{l}
              </label>
            ))}
          </div>
          {method === "SINGLE" ? (
            <Field label="Paid entirely for" htmlFor="e-single"><Select id="e-single" value={single} onChange={(e) => setSingle(e.target.value)}>{active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          ) : (
            <ul className="space-y-2">
              {active.map((t) => {
                const on = selected.includes(t.id);
                return (
                  <li key={t.id} className="flex items-center gap-3">
                    <label className="flex min-h-10 flex-1 items-center gap-2 text-sm">
                      <input type="checkbox" className="h-5 w-5" checked={on} onChange={() => setSelected(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])} />
                      {t.name}{!t.active ? " (left trip)" : ""}
                    </label>
                    {on && method !== "EQUAL" && (
                      <Input aria-label={`${t.name} ${method === "PERCENT" ? "percent" : "amount"}`} inputMode="decimal" className="w-28" value={values[t.id] ?? ""} onChange={(e) => setValues({ ...values, [t.id]: e.target.value })} placeholder={method === "PERCENT" ? "%" : currency} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {preview && <p className={cx("text-sm", preview.ok ? "text-muted" : "text-danger")}>{preview.text}</p>}
        </fieldset>

        {currency && currency !== tripCurrency && <Notice>Add a {tripCurrency} conversion below to deduct this {currency} expense from the trip budget.</Notice>}
        <details open={convOn} onToggle={(e) => setConvOn((e.target as HTMLDetailsElement).open)} className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium">Convert for balances and budget (optional)</summary>
          <p className="mt-2 text-xs text-muted">Only if your group agrees on a rate. The original amount and currency are always kept.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Field label="Convert to" htmlFor="c-cur"><Select id="c-cur" name="convCurrency" defaultValue={expense?.conversion?.currency ?? tripCurrency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label={`Rate (1 ${currency} =)`} htmlFor="c-rate"><Input id="c-rate" name="convRate" inputMode="decimal" defaultValue={expense?.conversion?.rate ?? ""} required={convOn} /></Field>
            <Field label="Rate date" htmlFor="c-date"><Input id="c-date" name="convDate" type="date" defaultValue={expense?.conversion?.rateDate ?? today} required={convOn} /></Field>
          </div>
        </details>
        <Field label="Notes" htmlFor="e-notes"><Textarea id="e-notes" name="notes" defaultValue={expense?.notes ?? ""} /></Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save expense"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function SettleDialog({ open, initial, onClose, tripId, travelers, tripCurrency, timezone }: Props & { open: boolean; initial: { fromId?: string; toId?: string; amountMinor?: number; currency?: string }; onClose: () => void }) {
  const { run, pending } = useAction();
  const [error, setError] = useState<string | null>(null);
  const cur = initial.currency ?? tripCurrency;
  const now = new Date();
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(now).replace(" ", "T");
  return (
    <Dialog open={open} onClose={onClose} title="Settle up">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setError(null);
          // The entered wall-clock time is interpreted in the trip's time zone.
          const paidAt = zonedToUtc(String(f.get("paidAt")), timezone).toISOString();
          const r = await run(() => recordSettlementAction(tripId, { fromId: String(f.get("from")), toId: String(f.get("to")), amount: String(f.get("amount")), currency: String(f.get("currency")), paidAt, note: String(f.get("note") || "") || null }), { success: "Repayment recorded", onError: (r) => setError(r.error) });
          if (r !== null) onClose();
        }}
      >
        <Notice tone="neutral">Record a repayment someone made outside Tripanize (cash, bank transfer, payment app). Tripanize doesn't transfer money. Partial repayments are fine.</Notice>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Who paid back" htmlFor="st-from"><Select id="st-from" name="from" defaultValue={initial.fromId}>{travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="To whom" htmlFor="st-to"><Select id="st-to" name="to" defaultValue={initial.toId ?? travelers[1]?.id}>{travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Amount" htmlFor="st-amt"><Input id="st-amt" name="amount" inputMode="decimal" required defaultValue={initial.amountMinor ? minorToDecimalString(initial.amountMinor, cur) : ""} /></Field>
          <Field label="Currency" htmlFor="st-cur"><Select id="st-cur" name="currency" defaultValue={cur}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label={`Date & time (${timezone})`} htmlFor="st-at" className="sm:col-span-2"><Input id="st-at" name="paidAt" type="datetime-local" required defaultValue={local} /></Field>
          <Field label="Note (optional)" htmlFor="st-note" className="sm:col-span-2"><Input id="st-note" name="note" placeholder="e.g. bank transfer" /></Field>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>Record repayment</Button>
        </div>
      </form>
    </Dialog>
  );
}
