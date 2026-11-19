"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Notice } from "./ui";
import { notifyCreditsChanged } from "./credits";
import type { tripWallet } from "@/server/credits/service";

type Wallet = Awaited<ReturnType<typeof tripWallet>>;
const LABELS: Record<string, string> = { unlock: "Premium unlocked with credits", purchase: "Included with Premium", topup: "Added from your balance", adjust: "Adjusted" };
const SPEND: Record<string, string> = { plan: "Planned days with AI", regenerate: "Regenerated days with AI", restaurants: "Restaurant ideas", events: "Event search", assistant: "AI assistant", swap: "Stop alternatives", packing: "Packing suggestions" };
const when = (d: string | Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * The trip's own credits: AI on this trip is paid from here. When they run out, nothing is taken from
 * the organizer's balance by itself; the organizer moves credits over here when they choose.
 */
export function TripCredits({ tripId, initial }: { tripId: string; initial: Wallet }) {
  const router = useRouter();
  const [wallet, setWallet] = useState(initial); const [amount, setAmount] = useState("30");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState("");
  if (!wallet.active) return null;
  async function add() {
    setBusy(true); setError(""); setDone("");
    try {
      const r = await fetch(`/api/trips/${tripId}/credits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(amount) }) });
      const data = await r.json() as Wallet & { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Please try again.");
      setWallet(data); setDone(`Added ${amount} credits to this trip.`); notifyCreditsChanged(); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(false); }
  }
  const n = Number(amount), valid = Number.isInteger(n) && n > 0 && (wallet.bank ?? 0) >= n;
  return <section id="trip-credits" aria-labelledby="trip-credits-h" className="scroll-mt-24">
    <Card className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 id="trip-credits-h" className="text-sm text-muted">This trip’s credits</h2><p className="font-display text-4xl font-extrabold tabular-nums">{wallet.balance}</p></div>
        {wallet.bank !== null && <div className="text-right"><p className="text-sm text-muted">Your balance</p><p className="font-display text-2xl font-bold tabular-nums">{wallet.bank}</p></div>}
      </div>
      <p className="text-sm text-muted">AI on this trip (planning, events, the assistant, swaps) is paid from the trip’s credits. When they run out, AI pauses until you add more. Nothing is taken from your balance unless you add it here.</p>
      {wallet.balance < 3 && wallet.exists && <Notice tone="warn">This trip is almost out of credits.</Notice>}
      {wallet.owner ? <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">Add from your balance
          <Input type="number" inputMode="numeric" min={1} max={wallet.bank ?? 0} step={1} value={amount} onChange={e => setAmount(e.target.value)} className="w-32" />
        </label>
        <Button variant="primary" disabled={busy || !valid} onClick={add}>{busy ? "Adding…" : "Add to this trip"}</Button>
        {(wallet.bank ?? 0) < 1 && <a href="/account/credits#top-up" className="text-sm font-semibold underline">Top up your balance</a>}
      </div> : <p className="text-sm text-muted">Only the organizer can add credits to this trip.</p>}
      {done && <Notice tone="sage">{done}</Notice>}{error && <Notice tone="danger">{error}</Notice>}
      {wallet.history.length > 0 && <ul className="divide-y divide-line border-t border-line text-sm">
        {wallet.history.map(h => <li key={h.id} className="flex items-center justify-between gap-4 py-2">
          <span><span className="block">{h.kind === "spend" ? SPEND[h.note ?? ""] ?? "AI" : LABELS[h.kind] ?? h.note ?? "Credits"}</span><span className="block text-xs text-muted">{when(h.createdAt)}</span></span>
          <span className={`font-bold tabular-nums ${h.amount > 0 ? "text-sage-ink" : ""}`}>{h.amount > 0 ? `+${h.amount}` : h.amount}</span>
        </li>)}
      </ul>}
    </Card>
  </section>;
}
