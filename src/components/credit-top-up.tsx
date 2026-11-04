"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Notice, Select } from "@/components/ui";
import { preparePaddle } from "@/components/premium-checkout";
import { notifyCreditsChanged } from "@/components/credits";
import type { CreditBundle } from "@/lib/credits";

const COPY: Record<CreditBundle["id"], string> = {
  topup: "A little extra to keep planning.",
  starter: "Plenty for a whole trip. Also unlocks Premium for one trip.",
  plus: "Room for two trips, or one with lots of changes. Also unlocks Premium for one trip.",
  pro: "For frequent travellers. Also unlocks Premium for one trip.",
};
const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Account › Credits: the four bundles, a trip to unlock Premium for, and Paddle's checkout window. */
export function CreditTopUp({ bundles, trips, available }: { bundles: readonly CreditBundle[]; trips: { id: string; name: string }[]; available: boolean }) {
  const router = useRouter();
  const [tripId, setTripId] = useState(trips[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  async function post<T>(body: object): Promise<T> {
    const r = await fetch("/api/credits/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json() as T & { error?: string }; if (!r.ok) throw new Error(data.error ?? "Please try again."); return data;
  }
  /** Right after Paddle reports the payment: checks that payment every second until its credits are in. */
  async function confirm(transactionId: string, credits: number, close: () => void) {
    setMessage("Payment received. Adding your credits…");
    for (let i = 0; i < 45; i++) {
      try {
        const r = await post<{ added: boolean; balance: number }>({ refresh: true, transactionId });
        if (r.added) {
          close(); notifyCreditsChanged(); router.refresh();
          setMessage(`Done! ${credits} credits added. Your balance is now ${r.balance}.`);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      } catch { /* keep trying */ }
      await new Promise(r => setTimeout(r, i < 20 ? 1000 : 3000));
    }
    setMessage("Your payment went through. Paddle is still confirming it; your credits will appear here within a few minutes.");
  }
  async function buy(b: CreditBundle) {
    setBusy(b.id); setError(""); setMessage("");
    try {
      const data = await post<{ transactionId: string; clientToken: string; environment: "sandbox" | "live" }>({ bundleId: b.id, tripId: b.unlocksPremium ? tripId || null : null });
      let started = false;
      const paddle = await preparePaddle(data.clientToken, data.environment, event => {
        if (event.name === "checkout.completed" && !started) { started = true; void confirm(data.transactionId, b.credits, () => paddle.Checkout.close()); }
      });
      paddle.Checkout.open({ transactionId: data.transactionId, settings: { displayMode: "overlay", showAddDiscounts: false, showAddTaxId: true } });
    } catch (e) { setError(e instanceof Error ? e.message : "Checkout could not be opened."); } finally { setBusy(null); }
  }
  return <div className="space-y-3">
    {trips.length > 0 && <label className="block text-sm">
      <span className="mb-1 block font-medium">Unlock Premium for</span>
      <Select value={tripId} onChange={e => setTripId(e.target.value)} className="w-full sm:w-auto">
        {trips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        <option value="">No trip, just credits</option>
      </Select>
      <span className="mt-1 block text-xs text-muted">Starter, Plus and Pro also unlock Premium for this trip: shared expenses, group chat, member locations and the AI assistant.</span>
    </label>}
    {error && <Notice tone="danger">{error}</Notice>}
    {message && <Notice tone="sage">{message}</Notice>}
    <ul className="grid gap-3 sm:grid-cols-2">
      {bundles.map(b => <li key={b.id}><Card className="flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-3"><p className="font-display text-2xl font-extrabold tabular-nums">{b.credits}<span className="ml-1.5 text-sm font-bold text-muted">credits</span></p><p className="font-bold">{money(b.priceCents)}</p></div>
        {b.id === "pro" && <Badge tone="accent" className="mt-2 self-start">Best value</Badge>}
        <p className="mt-2 flex-1 text-sm text-muted">{COPY[b.id]}</p>
        {available
          ? <Button variant={b.id === "starter" ? "primary" : "secondary"} className="mt-4" disabled={busy !== null} onClick={() => buy(b)}>{busy === b.id ? "Opening checkout…" : `Buy for ${money(b.priceCents)}`}</Button>
          : <button type="button" disabled className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-surface-2 px-5 text-sm font-bold text-muted">Coming soon</button>}
      </Card></li>)}
    </ul>
  </div>;
}
