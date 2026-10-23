"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, LinkButton, Notice, cx } from "./ui";
import { PremiumStar } from "./premium-star";
import { saveTripFeaturesAction } from "@/app/actions/features";
import { PREMIUM_FEATURE_KEYS, PREMIUM_FEATURES, PREMIUM_FEATURE_DETAILS, premiumPrice, tripCheckoutQuote, type PremiumBandId, type PremiumFeature } from "@/lib/plans";
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
  useEffect(() => { setSummary(initial); }, [initial]);
  const quote = tripCheckoutQuote(summary.selectedFeatures, summary.people, summary.creditMinor);
  const due = summary.premium ? 0 : quote.dueMinor;
  async function selectFeatures(features: PremiumFeature[]) {
    const previous = summary;
    setSummary({ ...summary, selectedFeatures: features });
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await saveTripFeaturesAction(tripId, features);
      if (!result.ok) throw new Error(result.error);
      setSummary(result.data); router.refresh();
    } catch (e) {
      setSummary(previous); setError(e instanceof Error ? e.message : "Selection could not be saved.");
    } finally { setBusy(false); }
  }
  function continueNormal() {
    router.push(`/trips/${tripId}/itinerary?checkout=normal`);
  }
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
  return <div className="space-y-6">
    <section aria-labelledby="included-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3"><h2 id="included-heading" className="font-display text-xl font-semibold">Start adding your information</h2><span className="text-sm font-semibold text-accent-ink">Included · $0</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { title: "Trip details", text: "Add destinations, dates, travelers, stays and preferences.", href: "settings#details" },
          { title: "Your itinerary", text: "Add and move stops on every day. AI can draft the first 3 days with Normal.", href: "itinerary" },
          { title: "Your bookings", text: "Add the reservations you have made yourself.", href: "bookings" },
          { title: "Your packing list", text: "Add your own items and check them off as you pack.", href: "packing" },
        ].map(item => <Link key={item.title} href={`/trips/${tripId}/${item.href}`} className="rounded-2xl border border-line bg-surface p-4 hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><span className="font-semibold">{item.title} <span aria-hidden className="float-right text-accent-ink">↗</span></span><span className="mt-1 block text-sm text-muted">{item.text}</span></Link>)}
      </div>
    </section>
    <section aria-labelledby="optional-heading">
      <h2 id="optional-heading" className="flex items-center gap-2 font-display text-xl font-semibold">Add more to your trip <PremiumStar /></h2>
      <p className="mt-1 text-sm text-muted">Choose what you would like to use. A small star marks Premium features. Any selection unlocks the whole Premium package for your group after payment.</p>
      {!summary.canPurchase && <Notice className="mt-3">The trip organizer chooses Premium features and completes checkout for everyone.</Notice>}
      <fieldset disabled={busy || !summary.canPurchase || summary.premium} className="mt-4 grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Premium features for this trip</legend>
        {PREMIUM_FEATURE_KEYS.map(feature => {
          const checked = summary.premium || summary.selectedFeatures.includes(feature);
          return <label id={`feature-${feature}`} key={feature} className={cx("flex scroll-mt-24 items-start gap-3 rounded-2xl border bg-surface p-4 transition-colors focus-within:ring-2 focus-within:ring-accent target:ring-2 target:ring-accent", checked ? "border-accent bg-accent-soft/30" : "border-line", !summary.premium && summary.canPurchase && "cursor-pointer")}>
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" checked={checked} onChange={() => selectFeatures(checked ? summary.selectedFeatures.filter(f => f !== feature) : [...summary.selectedFeatures, feature])} />
            <span><span className="flex items-center gap-1.5 font-semibold">{PREMIUM_FEATURES[feature]} <PremiumStar /></span><span className="mt-1 block text-sm text-muted">{PREMIUM_FEATURE_DETAILS[feature]}</span></span>
          </label>;
        })}
      </fieldset>
    </section>
    <Card className="border-accent/40 bg-accent-soft/20" id="checkout">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="font-display text-xl font-semibold">Your trip checkout</h2><p className="mt-1 text-sm text-muted">{summary.people} {summary.people === 1 ? "person" : "people"} · {summary.premium ? "Premium active for this group" : summary.selectedFeatures.length ? `${summary.selectedFeatures.length} Premium feature${summary.selectedFeatures.length === 1 ? "" : "s"} selected` : "Normal features only"}</p></div>
        <div className="text-right" aria-live="polite" aria-atomic="true"><p className="text-xs text-muted">{due === 0 ? "Due today" : "Due before tax"}</p><p className="font-display text-4xl font-semibold text-accent-ink">{due === null ? "Unavailable" : premiumPrice(due)}</p></div>
      </div>
      {summary.premium ? <p className="mt-4 text-sm">All starred features are included in your paid Premium trip. There is no extra charge for using more features.</p> : !summary.selectedFeatures.length ? <p className="mt-4 text-sm">Your trip is free with Normal. No payment details are needed. You can add Premium later.</p> : <div className="mt-4 space-y-2 text-sm"><p>One Premium package covers every starred feature. Selecting more features does not increase the price.</p>{quote.band && <p>{quote.band.label}: <strong>{premiumPrice(quote.band.priceMinor)} per trip</strong>{summary.creditMinor > 0 ? `, less ${premiumPrice(summary.creditMinor)} already paid.` : "."}</p>}<p className="text-muted">Premium activates after payment. Tax, if applicable, is shown by Paddle before you pay.</p></div>}
      {summary.capacity > 0 && summary.people > summary.capacity && <Notice tone="warn" className="mt-3">Your group is larger than your paid option. Choose a starred feature to upgrade for the difference. Saved information is kept.</Notice>}
      {!quote.band && summary.selectedFeatures.length > 0 && <Notice tone="warn" className="mt-3">Premium currently supports up to 12 people. Remove the starred selections to continue with Normal for $0.</Notice>}
      {summary.reviewRequired && <Notice tone="warn" className="mt-3">A refund or payment adjustment needs review before another purchase. You can still continue with Normal.</Notice>}
      {!summary.available && summary.selectedFeatures.length > 0 && !summary.premium && <Notice className="mt-3">Checkout is temporarily unavailable. Your trip is saved and you can keep using Normal.</Notice>}
      {summary.environment === "sandbox" && <Notice tone="warn" className="mt-3">Test checkout only. No real payment is taken.</Notice>}
      <div className="mt-5 flex flex-wrap gap-2">
        {summary.premium ? <LinkButton href={`/trips/${tripId}/itinerary`} variant="primary">Continue to your trip · $0 due</LinkButton> : due === 0 ? <Button variant="primary" disabled={busy} onClick={continueNormal}>Checkout · $0</Button> : <Button variant="primary" disabled={busy || !summary.canPurchase || !summary.available || !quote.band || summary.reviewRequired} onClick={() => quote.band && checkout(quote.band.id)}>{busy ? "Please wait…" : `Checkout${due === null ? "" : ` · ${premiumPrice(due)}`}`}</Button>}
        {!summary.premium && summary.selectedFeatures.length > 0 && summary.canPurchase && <Button disabled={busy} onClick={() => selectFeatures([])}>Remove Premium selections</Button>}
        {due !== 0 && <LinkButton href={`/trips/${tripId}/itinerary`} variant="ghost">Keep adding information</LinkButton>}
      </div>
      {summary.creditMinor > 0 && <p className="mt-3 text-xs text-muted">{premiumPrice(summary.creditMinor)} already paid toward this trip · covers up to {summary.capacity} people. Removing selections does not refund a payment.</p>}
    </Card>
    <p className="text-sm text-muted">One-time payment in USD. The organizer and all travelers count, including children and people without accounts. If the group outgrows the paid option, upgrading costs only the price difference. Your trip budget is separate from this Premium payment.</p>
    <p className="text-xs leading-5 text-muted">Premium purchases are subject to our <Link href="/terms" className="text-accent-ink underline">Terms</Link>, <Link href="/privacy" className="text-accent-ink underline">Privacy policy</Link> and <Link href="/refunds" className="text-accent-ink underline">Refund policy</Link>. Need help? <Link href="/contact?topic=billing" className="text-accent-ink underline">Contact support</Link>.</p>
    {summary.canPurchase && summary.available && <Button disabled={busy} onClick={refresh}>{busy ? "Please wait…" : "Check payment status"}</Button>}
    {message && <Notice tone="sage">{message}</Notice>}{error && <Notice tone="danger">{error}</Notice>}
  </div>;
}
