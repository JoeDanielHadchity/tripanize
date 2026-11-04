"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CreditsView } from "@/server/credits/service";

const CHANGED = "tripanize:credits-changed";
/** Tell every balance on the page to refresh (after an AI action, a purchase or a refund). */
export function notifyCreditsChanged() { if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED)); }

/**
 * The credits that pay for this person's AI (on a trip: the organizer's, for an editor).
 * Null until loaded, and `active: false` while credits don't apply to them yet.
 */
export function useCredits(tripId?: string | null) {
  const [view, setView] = useState<CreditsView | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/credits${tripId ? `?tripId=${encodeURIComponent(tripId)}` : ""}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() as Promise<CreditsView> : null).then(v => { if (alive && v) setView(v); }).catch(() => undefined);
    load();
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener(CHANGED, load); document.addEventListener("visibilitychange", onFocus);
    return () => { alive = false; window.removeEventListener(CHANGED, load); document.removeEventListener("visibilitychange", onFocus); };
  }, [tripId]);
  return view;
}

/** The threshold under which the organizer gets a gentle "running low" note on their trips. */
export const LOW_CREDITS = 20;

/**
 * The quiet cost line under an AI button: "Uses 18 of your 85 AI credits." Nothing while credits
 * don't apply to this person, so everyone else sees the app exactly as before.
 */
export function CreditNote({ credits, tripId, className }: { credits: number; tripId?: string | null; className?: string }) {
  const view = useCredits(tripId);
  if (!view?.active || credits <= 0) return null;
  const cls = className ?? "mt-1.5 text-xs text-muted";
  if (view.membersBlocked) return <p className={cls}>The organizer has turned off AI for members on this trip.</p>;
  const n = `${credits} AI credit${credits === 1 ? "" : "s"}`;
  if (view.balance < credits) return <p className={cls}>Needs {n}; {view.payerIsYou ? "you have" : "the organizer has"} {view.balance}. {view.payerIsYou ? <Link href="/credits" className="font-semibold underline">Top up</Link> : "Ask the organizer to top up."}</p>;
  return <p className={cls}>Uses {credits} of {view.payerIsYou ? "your" : "the organizer's"} {view.balance} AI credits.</p>;
}

/** On trip pages, for the organizer only: a small heads-up once their AI credits run low. */
export function LowCreditsNotice({ tripId }: { tripId: string }) {
  const view = useCredits(tripId);
  if (!view?.active || !view.payerIsYou || view.balance >= LOW_CREDITS) return null;
  return <p className="mb-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">{view.balance === 0 ? "You've used all your AI credits." : `You're running low on AI credits (${view.balance} left).`} <Link href="/credits" className="font-semibold text-accent-ink underline">Top up</Link> to keep planning with AI. Everything else keeps working.</p>;
}

/** Account page: one line with the balance and a way to top up. */
export function AccountCreditsLine() {
  const view = useCredits();
  if (!view?.active) return null;
  return <p className="text-sm">AI credits: <span className="font-bold tabular-nums">{view.balance}</span> · <Link href="/credits" className="font-semibold text-accent-ink underline">Top up</Link></p>;
}
