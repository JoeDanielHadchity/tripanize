"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startPlanAction, cancelPlanAction } from "@/app/actions/itinerary";

export function RefreshRestaurants({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/trips/${tripId}/jobs/${jobId}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Could not check restaurant research. Refresh the page to try again.");
        const job = await response.json() as { status: string; error?: string | null };
        if (controller.signal.aborted) return;
        if (job.status === "SUCCEEDED") { setJobId(null); setMessage("Restaurant choices refreshed. Undo is available in Versions."); router.refresh(); return; }
        if (["FAILED", "CANCELLED"].includes(job.status)) { setJobId(null); setMessage(job.error ?? "Restaurant research stopped. Your saved itinerary is kept."); return; }
        setMessage("Researching distinct restaurants for your whole trip…");
        timer = setTimeout(poll, 3000);
      } catch (error) { if (!controller.signal.aborted) { setMessage(error instanceof Error ? error.message : "Could not check restaurant research."); setJobId(null); } }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, tripId, router]);
  async function start() {
    setStarting(true); setMessage(null);
    try {
      const result = await startPlanAction(tripId, "restaurants", {});
      if (result.ok) setJobId(result.data.jobId);
      else setMessage(result.error);
    } catch { setMessage("Could not start restaurant research. Please try again."); }
    finally { setStarting(false); }
  }
  return <div className="mb-5">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={start} disabled={starting || Boolean(jobId)} className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm font-medium disabled:opacity-60">{starting || jobId ? "Researching restaurants…" : "Refresh restaurants"}</button>
      {jobId ? <button type="button" className="min-h-11 text-sm underline" onClick={() => { void cancelPlanAction(tripId, jobId); }}>Cancel</button> : <span className="text-xs text-muted">Whole trip · bookings and manual activities kept</span>}
    </div>
    {message && <p role="status" className="mt-2 text-sm text-muted">{message}</p>}
  </div>;
}
