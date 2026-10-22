"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Notice } from "./ui";
import { premiumPrice, type PremiumBandId } from "@/lib/plans";
import type { billingSummary } from "@/server/billing/service";

type Summary = Awaited<ReturnType<typeof billingSummary>>;
type Paddle = { Environment: { set: (environment: "sandbox") => void }; Initialize: (opts: { token: string; eventCallback: (event: { name: string }) => void }) => void; Checkout: { open: (opts: { transactionId: string; settings: { displayMode: "overlay"; showAddDiscounts: false; showAddTaxId: true } }) => void } };
declare global { interface Window { Paddle?: Paddle } }
let paddleLoading: Promise<Paddle> | undefined;
let paddleInitialized = false;
async function loadPaddle() {
  if (window.Paddle) return window.Paddle;
  return paddleLoading ??= new Promise<Paddle>((resolve, reject) => {
    const script = document.createElement("script"); script.src = "https://cdn.paddle.com/paddle/v2/paddle.js"; script.async = true;
    script.onload = () => window.Paddle ? resolve(window.Paddle) : reject(new Error("Checkout could not be loaded."));
    script.onerror = () => { paddleLoading = undefined; script.remove(); reject(new Error("Please check your connection and try again.")); };
    document.head.appendChild(script);
  });
}
export async function preparePaddle(token: string, environment: "sandbox" | "live", eventCallback: (event: { name: string }) => void = () => {}) {
  const paddle = await loadPaddle();
  if (!paddleInitialized) {
    if (environment === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({ token, eventCallback }); paddleInitialized = true;
  }
  return paddle;
}
export function PremiumCheckout({ tripId, initial }: { tripId: string; initial: Summary }) {
  const router = useRouter(); const [summary, setSummary] = useState(initial); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function request<T>(body: object): Promise<T> {
    const response = await fetch(`/api/trips/${tripId}/premium`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(data.error ?? "Payment could not be checked."); return data;
  }
  async function refresh() {
    setBusy(true); setError("");
    try { const updated: Summary = await request({ refresh: true }); setSummary(updated); setMessage(updated.creditMinor > summary.creditMinor ? "Payment confirmed. Your trip has been updated." : "Your latest payment status is shown below. If you just paid, confirmation may take a moment."); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  async function checkout(bandId: PremiumBandId) {
    setBusy(true); setError(""); setMessage("");
    try {
      await loadPaddle();
      const data: { transactionId: string; clientToken: string; environment: "sandbox" | "live"; reused: boolean; amountMinor: number; capacity: number } = await request({ bandId });
      if (data.reused) setMessage(`Continuing your pending checkout: ${premiumPrice(data.amountMinor)} for up to ${data.capacity} people. Finish this payment before starting another upgrade.`);
      const paddle = await preparePaddle(data.clientToken, data.environment, event => { if (event.name === "checkout.completed") setMessage("Payment submitted. Select Check payment status to confirm Premium for this trip."); });
      paddle.Checkout.open({ transactionId: data.transactionId, settings: { displayMode: "overlay", showAddDiscounts: false, showAddTaxId: true } });
    } catch (e) { setError(e instanceof Error ? e.message : "Checkout could not be opened."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <Card><p className="text-sm font-semibold text-accent-ink">{summary.preview ? "Premium preview" : summary.premium ? "Premium active" : "Normal trip"}</p><h2 className="mt-2 font-display text-2xl font-semibold">{summary.people} {summary.people === 1 ? "person" : "people"} in this trip</h2><p className="mt-2 text-sm text-muted">{summary.creditMinor ? `${premiumPrice(summary.creditMinor)} already paid toward this trip. Your paid option covers up to ${summary.capacity} people.` : "One payment by the organizer unlocks Premium for the whole group."}</p>
      {summary.capacity > 0 && summary.people > summary.capacity && <Notice tone="warn" className="mt-3">Your group is larger than your paid option. Upgrade to use Premium with everyone. Saved trip information is kept.</Notice>}
    </Card>
    {!summary.available && <Notice tone="accent">Payments are being set up. Your trip stays available during the preview. No payment can be taken here yet.</Notice>}
    {summary.environment === "sandbox" && <Notice tone="warn">Test checkout only. No real payment is taken.</Notice>}
    {summary.reviewRequired && <Notice tone="warn">A refund or payment adjustment needs review before another purchase. Check your Paddle receipt and payment status.</Notice>}
    {!summary.recommended && <Notice>Premium currently supports up to 12 people. You can continue planning manually with Normal.</Notice>}
    {!summary.canPurchase && <Notice>Only the trip organizer can purchase or upgrade Premium.</Notice>}
    <div className="grid gap-4 md:grid-cols-3">{summary.options.map(b => <Card key={b.id} className={summary.recommended === b.id ? "border-accent" : ""}><h3 className="font-semibold">{b.label}</h3><p className="mt-3 font-display text-3xl font-semibold">{premiumPrice(b.priceMinor)}<span className="ml-1 font-sans text-sm font-normal text-muted">/ trip</span></p><p className="mt-2 text-sm text-muted">Same Premium features for the whole group.</p><Button className="mt-4 w-full" variant={summary.recommended === b.id ? "primary" : "secondary"} disabled={busy || !summary.available || !summary.canPurchase || !b.eligible || summary.reviewRequired} onClick={() => checkout(b.id)}>{b.capacity < summary.people ? "Group too large" : b.priceMinor <= summary.creditMinor ? "Covered" : `${summary.creditMinor ? "Upgrade" : "Unlock"} · ${premiumPrice(b.dueMinor)}`}</Button></Card>)}</div>
    <p className="text-sm text-muted">One-time payment in USD. Tax, if applicable, is shown at checkout. The organizer and all travelers count, including children and people without accounts. Adding people beyond your paid limit requires an upgrade; you pay only the price difference.</p>
    {summary.canPurchase && summary.available && <Button disabled={busy} onClick={refresh}>{busy ? "Checking…" : "Check payment status"}</Button>}
    {message && <Notice tone="sage">{message}</Notice>}{error && <Notice tone="danger">{error}</Notice>}
  </div>;
}
