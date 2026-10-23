"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, LinkButton, Notice, Spinner } from "@/components/ui";
import { retryOnboardingAction } from "@/app/actions/onboarding";
import type { onboardingState } from "@/server/trips/onboarding";
type State = Awaited<ReturnType<typeof onboardingState>>;
export function OnboardingProgress({ tripId }: { tripId: string }) {
  const [state, setState] = useState<State | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const router = useRouter();
  useEffect(() => {
    let stop = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { try { const r = await fetch(`/api/trips/${tripId}/onboarding`, { cache: "no-store" }); const data = await r.json() as State; if (!r.ok) throw new Error("Unable to check progress."); if (stop) return; setState(data); setError(""); if (data.onboardingStage === "COMPLETE") { router.replace(`/trips/${tripId}/itinerary?ready=1`); router.refresh(); return; } } catch (e) { if (!stop) setError(e instanceof Error ? e.message : "Reconnecting…"); } if (!stop) timer = setTimeout(poll, 2500); };
    void poll(); return () => { stop = true; clearTimeout(timer); };
  }, [tripId, router]);
  const failed = state?.job && ["FAILED", "CANCELLED"].includes(state.job.status);
  const progress = (state?.job?.progress ?? []) as { at: string; message: string }[];
  return <Card><h2 className="font-display text-xl font-semibold">{failed ? "Preparation needs another try" : "Preparing your trip"}</h2><div className="mt-4 space-y-3" aria-live="polite">{!failed && <Spinner label="Planning, researching and preparing your trip…" />}<ol className="space-y-2 text-sm text-muted">{progress.slice(-8).map((p, i) => <li key={`${p.at}-${i}`}>{p.message}</li>)}</ol></div>{error && <Notice className="mt-4">{error} We will keep checking.</Notice>}{failed && <Notice tone="warn" className="mt-4"><p>{state?.job?.error} Saved information is kept. Retry to finish preparing your trip.</p><Button disabled={busy} className="mt-2" onClick={async () => { setBusy(true); const r = await retryOnboardingAction(tripId); if (!r.ok) setError(r.error); setBusy(false); }}>Retry preparation</Button></Notice>}<p className="mt-4 text-xs text-muted">Nothing is reserved or purchased from travel providers. Suggested events, prices, opening hours and weather remain subject to verification.</p><LinkButton href={`/trips/${tripId}/itinerary`} className="mt-4" variant="ghost">View trip while it is being prepared</LinkButton></Card>;
}
