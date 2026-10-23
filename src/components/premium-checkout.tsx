"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, LinkButton, Notice } from "./ui";
import { PremiumStar } from "./premium-star";
import { chooseNormalAction } from "@/app/actions/onboarding";
import { PlanComparison } from "./plan-comparison";
import type { billingSummary } from "@/server/billing/service";

type Summary = Awaited<ReturnType<typeof billingSummary>>;
type Paddle = { Environment: { set: (environment: "sandbox") => void }; Initialize: (opts: { token: string; eventCallback: (event: { name: string }) => void }) => void; Checkout: { open: (opts: { transactionId: string; settings: { displayMode: "overlay"; showAddDiscounts: false; showAddTaxId: true } }) => void } };
declare global { interface Window { Paddle?: Paddle } }
let paddleLoading: Promise<Paddle> | undefined;
let paddleInitialized = false;
let paddleEvents: (event: { name: string }) => void = () => {};
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
  paddleEvents = eventCallback;
  if (!paddleInitialized) {
    if (environment === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({ token, eventCallback: event => paddleEvents(event) }); paddleInitialized = true;
  }
  return paddle;
}
export function PremiumCheckout({ tripId, initial }: { tripId: string; initial: Summary }) {
  const router = useRouter();
  const [summary, setSummary] = useState(initial); const [busy, setBusy] = useState(false); const [awaiting, setAwaiting] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { setSummary(initial); }, [initial]);
  const hasPremium = summary.premium && !summary.preview;
  const next = `/trips/${tripId}/${summary.onboardingStage === "COMPLETE" ? "itinerary" : "onboarding"}`;
  async function request<T>(body: object): Promise<T> {
    const r = await fetch(`/api/trips/${tripId}/premium`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json() as T & { error?: string }; if (!r.ok) throw new Error(data.error ?? "Please try again."); return data;
  }
  async function refresh() {
    const updated = await request<Summary>({ refresh: true }); setSummary(updated);
    if (updated.premium) { setAwaiting(false); router.push(`/trips/${tripId}/${updated.onboardingStage === "COMPLETE" ? "itinerary" : "onboarding"}`); router.refresh(); }
    return updated;
  }
  useEffect(() => {
    if (!awaiting) return;
    let stopped = false, attempts = 0; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { if (stopped) return; try { const r = await refresh(); if (r.premium) return; } catch { /* the manual check remains available */ } if (++attempts < 12 && !stopped) timer = setTimeout(poll, 3000); else if (!stopped) { setAwaiting(false); setMessage("Payment confirmation is taking longer than expected. Use Check payment status to continue; do not pay again."); } };
    timer = setTimeout(poll, 1500); return () => { stopped = true; clearTimeout(timer); };
  }, [awaiting, tripId]);
  async function normal() {
    setBusy(true); setError("");
    try { const r = await chooseNormalAction(tripId); if (!r.ok) throw new Error(r.error); router.push(r.data.next); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(false); }
  }
  async function checkout() {
    setBusy(true); setError(""); setMessage("");
    try {
      await loadPaddle();
      const data = await request<{ transactionId: string; clientToken: string; environment: "sandbox" | "live" }>({ bandId: "premium" });
      const paddle = await preparePaddle(data.clientToken, data.environment, event => { if (event.name === "checkout.completed") { setMessage("Confirming your payment. Your trip questions are next."); setAwaiting(true); } });
      paddle.Checkout.open({ transactionId: data.transactionId, settings: { displayMode: "overlay", showAddDiscounts: false, showAddTaxId: true } });
    } catch (e) { setError(e instanceof Error ? e.message : "Checkout could not be opened."); } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2">
      <Card><Badge>Normal</Badge><h2 className="mt-4 font-display text-4xl font-semibold">Free</h2><p className="mt-3 text-sm text-muted">AI helps with the first 2 days. Build the rest yourself, add your own bookings and pack with your own checklist.</p><Button className="mt-5 w-full" disabled={busy || !summary.canPurchase} onClick={normal}>{hasPremium ? "Premium is already active" : summary.onboardingStage === "COMPLETE" ? "Continue with Normal" : "Choose Normal · $0"}</Button><p className="mt-2 text-xs text-muted">Upgrade to Premium whenever you want.</p></Card>
      <Card className="border-accent bg-accent-soft/30"><Badge tone="accent"><PremiumStar /> Premium</Badge><h2 className="mt-4 font-display text-4xl font-semibold">$15<span className="ml-2 font-sans text-sm font-normal text-muted">USD / trip</span></h2><p className="mt-3 text-sm text-muted">One organizer. Any group size. A complete itinerary with researched events, linked booking suggestions, custom packing and all Premium tools.</p>{hasPremium ? <LinkButton href={next} variant="primary" className="mt-5 w-full">{summary.onboardingStage === "COMPLETE" ? "Premium active · open trip" : "Continue to trip questions"}</LinkButton> : <Button className="mt-5 w-full" variant="primary" disabled={busy || awaiting || !summary.canPurchase || !summary.available || summary.reviewRequired} onClick={checkout}>{busy ? "Opening checkout…" : awaiting ? "Confirming payment…" : "Choose Premium · pay $15"}</Button>}<p className="mt-2 text-xs text-muted">One-time payment. Applicable tax is shown before you pay.</p></Card>
    </div>
    <PlanComparison />
    <Card><h2 className="font-display text-xl font-semibold">What happens next?</h2><ol className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><li><strong>1. Choose your plan</strong><p className="mt-1 text-muted">Normal is free. Premium payment comes before trip questions.</p></li><li><strong>2. Tell us about your trip</strong><p className="mt-1 text-muted">Add destination, dates and travel details. Premium adds tailored multiple-choice questions.</p></li><li><strong>3. Open your trip</strong><p className="mt-1 text-muted">We generate your plan automatically. Invite people as editors or viewers.</p></li></ol></Card>
    {!summary.canPurchase && <Notice>Only the trip organizer can choose or pay for the plan. Your role is managed in Trip settings.</Notice>}
    {!summary.available && !hasPremium && <Notice>Premium checkout is temporarily unavailable. You can continue with Normal.</Notice>}
    {summary.reviewRequired && <Notice tone="warn">A payment adjustment needs review. Contact support before making another purchase.</Notice>}
    {summary.environment === "sandbox" && <Notice tone="warn">Payment test environment. No real charges.</Notice>}
    <p className="text-xs text-muted">No subscription. Premium covers this trip and every member. Usage limits apply to AI requests. Location sharing is optional. Suggested events and booking links are not confirmed reservations. <Link href="/terms" className="underline">Terms</Link> · <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/refunds" className="underline">Refunds</Link></p>
    {summary.canPurchase && summary.available && <Button disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const r = await refresh(); if (!r.premium) setMessage("No completed payment yet. If you just paid, confirmation may take a moment."); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(false); } }}>Check payment status</Button>}
    {message && <Notice tone="sage">{message}</Notice>}{error && <Notice tone="danger">{error}</Notice>}
  </div>;
}
