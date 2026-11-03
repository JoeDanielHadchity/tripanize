"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** One reminder to finish trip setup: only on the itinerary, and it can be dismissed (per trip, on this device). */
export function SetupReminder({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const key = `tripanize-setup-dismissed-${tripId}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem(key) === "1"); } catch { setHidden(false); }
  }, [key]);
  if (hidden || !pathname?.endsWith(`/trips/${tripId}/itinerary`)) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem(key, "1"); } catch { /* private mode: hide for now only */ } };
  return (
    <div className="setup-reminder" role="region" aria-label="Trip setup">
      <span className="setup-reminder-icon" aria-hidden>✓</span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-extrabold">Finish setting up your trip</p>
        <p className="text-sm text-muted">A few quick questions help Tripanize plan days that suit your group.</p>
      </div>
      <Link href={`/trips/${tripId}/onboarding`} className="setup-reminder-go">Continue setup</Link>
      <button type="button" onClick={dismiss} aria-label="Hide this reminder" className="setup-reminder-close">
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
      </button>
    </div>
  );
}
