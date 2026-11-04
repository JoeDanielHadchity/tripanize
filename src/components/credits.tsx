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

/** "120 credits" in the header, linking to the Credits page; nothing while credits don't apply. */
export function CreditsBalance() {
  const view = useCredits();
  if (!view?.active) return null;
  return <Link href="/credits" className="credits-balance" aria-label={`${view.balance} credits. Get more credits`}>
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4" /></svg>
    {view.balance}<span className="credits-balance-word"> credits</span>
  </Link>;
}

/**
 * The price shown on an AI button: " · 21 credits". Shows nothing while credits don't apply,
 * so buttons look exactly as before for everyone else.
 */
export function CreditPrice({ credits, tripId }: { credits: number; tripId?: string | null }) {
  const view = useCredits(tripId);
  if (!view?.active || credits <= 0) return null;
  return <span className="credit-price"> · {credits} credit{credits === 1 ? "" : "s"}</span>;
}

/** A one-line note under an AI action: what it costs and what's left, or how to get more. */
export function CreditNote({ credits, tripId, className }: { credits: number; tripId?: string | null; className?: string }) {
  const view = useCredits(tripId);
  if (!view?.active || credits <= 0) return null;
  if (view.membersBlocked) return <p className={className ?? "mt-2 text-xs text-muted"}>The organizer has turned off AI for members on this trip.</p>;
  const whose = view.payerIsYou ? "You have" : "The organizer has";
  if (view.balance < credits) return <p className={className ?? "mt-2 text-xs text-muted"}>This uses {credits} credits. {whose} {view.balance}. {view.payerIsYou ? <Link href="/credits" className="font-semibold underline">Get credits</Link> : "Ask the organizer to add credits."}</p>;
  return <p className={className ?? "mt-2 text-xs text-muted"}>This uses {credits} credit{credits === 1 ? "" : "s"}. {whose} {view.balance}{view.payerIsYou ? "" : " for the group"}.</p>;
}
