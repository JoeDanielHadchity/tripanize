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

/** Account page: a card with the balance that opens Account › Credits. Nothing while credits don't apply. */
export function AccountCreditsCard() {
  const view = useCredits();
  if (!view?.active && !view?.unlimited) return null;
  return <Link href="/account/credits" className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4 hover:bg-surface-2">
    <span><span className="block font-display text-lg font-semibold">Credits</span><span className="block text-sm text-muted">Balance, prices, top up and history</span></span>
    <span className="shrink-0 text-right"><span className="block font-display text-2xl font-extrabold tabular-nums">{view.unlimited ? "Unlimited" : view.balance}</span><span className="block text-xs text-muted">AI credits</span></span>
  </Link>;
}
