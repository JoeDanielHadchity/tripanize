"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, LinkButton, Notice, Spinner, Textarea } from "@/components/ui";
import { Dialog, useAction } from "@/components/client";
import { replaceStopAction, startPlanAction } from "@/app/actions/itinerary";
import { PlanStopPreview } from "@/app/trips/[tripId]/plan/panel";
import type { PlanStop } from "@/server/planner/schema";
import { ImpactSummary } from "./impact";
import type { ImpactData, StopView } from "./types";

type Choice = { origin: "AI" | "MANUAL"; input: Record<string, unknown>; label: string };

function fromPlanStop(s: PlanStop): Record<string, unknown> {
  return {
    title: s.title, category: s.category, locationName: s.locationName, address: s.address, lat: s.lat, lng: s.lng, reason: s.reason, durationMin: s.durationMin, travelToNextMin: s.travelToNextMin,
    travelMode: s.travelMode, officialUrl: s.officialUrl, estCost: s.estCost === null ? null : String(s.estCost), bookingRequired: s.bookingRequired, bookingNote: s.bookingNote,
    hoursNote: s.hoursVerified ? s.hoursNote : `${s.hoursNote ?? "Opening hours"} (not verified)`, isMeal: s.isMeal, isFreeTime: s.isFreeTime, indoor: s.indoor,
  };
}

export function SwapDialog({ open, onClose, tripId, currency, stop, aiReady, premium = true }: { open: boolean; onClose: () => void; tripId: string; currency: string; stop: StopView | null; aiReady: boolean; premium?: boolean }) {
  const { run, pending } = useAction();
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [alts, setAlts] = useState<PlanStop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState("");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [impact, setImpact] = useState<ImpactData | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const res = await fetch(`/api/trips/${tripId}/jobs/${jobId}`, { cache: "no-store" }).catch(() => null);
      if (stop) return;
      if (!res?.ok) {
        t = setTimeout(poll, 4000);
        return;
      }
      const j = await res.json() as { status: string; proposal?: { alternatives?: PlanStop[] }; error?: string };
      setStatus(j.status);
      if (j.status === "SUCCEEDED") setAlts(j.proposal?.alternatives ?? []);
      else if (j.status === "FAILED" || j.status === "CANCELLED") setError(j.error ?? "Couldn't find alternatives.");
      else t = setTimeout(poll, 2000);
    };
    poll();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [jobId, tripId]);

  if (!stop) return null;
  const close = () => {
    setJobId(null);
    setAlts(null);
    setStatus(null);
    setError(null);
    setChoice(null);
    setImpact(null);
    onClose();
  };
  async function preview(c: Choice) {
    const r = await run(() => replaceStopAction(tripId, stop!.id, c.input as { title: string }, stop!.version, true, c.origin), { refresh: false });
    if (r) {
      setChoice(c);
      setImpact(r.impact);
    }
  }

  return (
    <Dialog open={open} onClose={close} title={`Swap “${stop.title}”`} wide>
      {choice ? (
        <div className="space-y-4">
          <p className="text-sm">Replace with <strong>{choice.label}</strong> at {stop.startTime ?? "the same slot"}.</p>
          {impact && <ImpactSummary impact={impact} currency={currency} />}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setChoice(null)}>Back</Button>
            <Button variant="primary" disabled={pending} onClick={async () => { const r = await run(() => replaceStopAction(tripId, stop.id, choice.input as { title: string }, stop.version, false, choice.origin), { success: "Stop swapped" }); if (r) close(); }}>
              Swap stop
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="font-semibold">Suggested alternatives</h3>
            {!premium ? (
              <Notice tone="accent">AI alternatives are included with Premium. You can enter a replacement manually below. <LinkButton href="/plans">See plans</LinkButton></Notice>
            ) : !aiReady ? (
              <Notice tone="warn">AI alternatives need OpenAI, which isn't configured on this server. You can enter a replacement manually below.</Notice>
            ) : !jobId ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">ChatGPT looks for comparable nearby options that fit your interests, time slot, budget, accessibility needs, weather and the rest of the day's route.</p>
                <Field label="Anything specific? (optional)" htmlFor="swap-req"><Input id="swap-req" value={request} onChange={(e) => setRequest(e.target.value)} placeholder="e.g. something indoors, cheaper, kid-friendly" maxLength={200} /></Field>
                <Button variant="primary" disabled={pending} onClick={async () => { const r = await run(() => startPlanAction(tripId, "swap", { stopId: stop.id, instruction: request || null }), { refresh: false }); if (r) setJobId(r.jobId); }}>
                  Find alternatives
                </Button>
              </div>
            ) : error ? (
              <Notice tone="danger">{error}</Notice>
            ) : !alts ? (
              <Spinner label={status === "RUNNING" ? "Searching for alternatives (usually under a minute)…" : "Waiting for the planning worker…"} />
            ) : alts.length === 0 ? (
              <p className="text-sm text-muted">No suitable alternatives were found.</p>
            ) : (
              <ul className="space-y-2">
                {alts.map((a, i) => (
                  <div key={i} className="space-y-2">
                    <PlanStopPreview s={a} />
                    <Button onClick={() => preview({ origin: "AI", input: fromPlanStop(a), label: a.title })}>Use this — review impact</Button>
                  </div>
                ))}
              </ul>
            )}
          </section>
          <section className="border-t border-line pt-4">
            <h3 className="font-semibold">Or enter a replacement</h3>
            <form
              className="mt-3 grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const title = String(f.get("title")).trim();
                if (!title) return;
                preview({ origin: "MANUAL", label: title, input: { title, address: String(f.get("address")) || null, durationMin: f.get("duration") ? Number(f.get("duration")) : stop.durationMin, estCost: String(f.get("cost")) || null, reason: String(f.get("reason")) || null, category: stop.category } });
              }}
            >
              <Field label="Title" htmlFor="m-title"><Input id="m-title" name="title" required /></Field>
              <Field label="Address" htmlFor="m-addr"><Input id="m-addr" name="address" /></Field>
              <Field label="Duration (min)" htmlFor="m-dur"><Input id="m-dur" name="duration" type="number" min={0} defaultValue={stop.durationMin ?? ""} /></Field>
              <Field label={`Est. cost (${currency})`} htmlFor="m-cost"><Input id="m-cost" name="cost" inputMode="decimal" /></Field>
              <Field label="Notes" htmlFor="m-reason" className="sm:col-span-2"><Textarea id="m-reason" name="reason" /></Field>
              <div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={pending}>Review impact</Button></div>
            </form>
          </section>
        </div>
      )}
    </Dialog>
  );
}
