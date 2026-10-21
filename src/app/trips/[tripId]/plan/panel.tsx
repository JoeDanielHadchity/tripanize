"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ExternalLink, Field, LinkButton, Notice, Spinner, Textarea, cx } from "@/components/ui";
import { useAction } from "@/components/client";
import { applyPlanAction, cancelPlanAction, startPlanAction } from "@/app/actions/itinerary";
import { formatDate, formatDuration } from "@/lib/dates";
import type { PlanDay, PlanStop, Proposal } from "@/server/planner/schema";
import type { Issue } from "@/server/planner/checks";

type Job = {
  id: string; kind: string; status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"; progress: { at: string; message: string }[];
  proposal: Proposal | null; checks: { issues: Issue[]; sources: string[] } | null; error: string | null; errorCode: string | null; appliedDates: string[]; model: string | null; cancelRequested: boolean;
};

export function PlanStopPreview({ s }: { s: PlanStop }) {
  return (
    <li className="rounded-xl border border-line bg-bg/40 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-sm text-muted">{s.startTime || "--:--"}</span>
        <span className="font-medium">{s.title}</span>
        <Badge tone="accent">Suggestion</Badge>
        {s.isMeal && <Badge tone="sage">Meal</Badge>}
        {s.isFreeTime && <Badge tone="sage">Free time</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted">{s.reason}</p>
      <p className="mt-1 text-xs text-muted">
        {[s.durationMin ? formatDuration(s.durationMin) : null, s.address ?? s.locationName, s.estCost !== null ? `≈ ${s.estCost} (estimate)` : null, s.travelToNextMin ? `~${s.travelToNextMin} min ${s.travelMode ?? ""} to next (estimate)` : null].filter(Boolean).join(" · ")}
      </p>
      {(s.hoursNote || s.bookingNote) && <p className="mt-1 text-xs text-warn-ink">{[s.hoursNote && `${s.hoursNote}${s.hoursVerified ? "" : " (not verified)"}`, s.bookingNote && `Booking advice: ${s.bookingNote}`].filter(Boolean).join(" · ")}</p>}
      {s.officialUrl && <p className="mt-1 text-xs"><ExternalLink href={s.officialUrl}>Official site</ExternalLink></p>}
    </li>
  );
}

function DayReview({ d, existingStops, checked, onToggle, issues, applied }: { d: PlanDay; existingStops: number; checked: boolean; onToggle: () => void; issues: Issue[]; applied: boolean }) {
  return (
    <Card className={cx(checked && "ring-2 ring-accent")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{formatDate(d.date, { weekday: "long", day: "numeric", month: "long" })}{d.isTravelDay ? " · Travel day" : ""}{d.driveMinutes ? ` · ~${formatDuration(d.driveMinutes)} driving (estimate)` : ""}</p>
          <h3 className="font-display text-lg font-semibold">{d.title}</h3>
          <p className="text-sm text-muted">{d.area}</p>
        </div>
        <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={checked} onChange={onToggle} />
          Accept day
        </label>
      </div>
      {applied && <Badge tone="sage" className="mt-2">Already applied</Badge>}
      {existingStops > 0 && <p className="mt-2 text-xs text-warn-ink">Accepting replaces this day's current stops. Fixed commitments, bookings and events you scheduled are kept. A version is saved so you can undo.</p>}
      {issues.length > 0 && (
        <ul className="mt-3 space-y-1">
          {issues.map((i, k) => <li key={k} className={cx("rounded-lg px-3 py-2 text-sm", i.severity === "conflict" ? "bg-danger-soft text-danger" : i.severity === "warning" ? "bg-warn-soft text-warn-ink" : "bg-surface-2 text-muted")}>{i.message}</li>)}
        </ul>
      )}
      <ol className="mt-3 space-y-2">{d.stops.map((s, i) => <PlanStopPreview key={i} s={s} />)}</ol>
      {d.planB.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-sage-ink">Plan B (indoor / bad weather){d.planBNote ? ` — ${d.planBNote}` : ""}</summary>
          <ol className="mt-2 space-y-2">{d.planB.map((s, i) => <PlanStopPreview key={i} s={s} />)}</ol>
        </details>
      )}
      {(d.notes.length > 0 || d.questions.length > 0) && (
        <div className="mt-3 space-y-1 text-sm">
          {d.notes.map((n, i) => <p key={i} className="text-muted">• {n}</p>)}
          {d.questions.map((q, i) => <p key={i} className="text-accent-ink">? {q}</p>)}
        </div>
      )}
    </Card>
  );
}

export function PlanPanel(props: { tripId: string; canEdit: boolean; aiReady: boolean; model: string; webSearch: boolean; missing: { field: string; question: string }[]; days: { date: string; title: string | null; stops: number }[]; hasPlan: boolean; initialJobId: string | null; preselectDays: string[] }) {
  const { tripId } = props;
  const router = useRouter();
  const { run, pending } = useAction();
  const [jobId, setJobId] = useState<string | null>(props.initialJobId);
  const [job, setJob] = useState<Job | null>(null);
  const [scope, setScope] = useState<"full" | "days">(props.preselectDays.length ? "days" : "full");
  const [selDays, setSelDays] = useState<string[]>(props.preselectDays);
  const [instruction, setInstruction] = useState("");
  const [accept, setAccept] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/trips/${tripId}/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Couldn't load job");
        const j = (await res.json()) as Job;
        if (stop) return;
        setJob(j);
        setLoadError(null);
        if (j.status === "QUEUED" || j.status === "RUNNING") timer = setTimeout(poll, 2000);
        else router.refresh();
        if (j.status !== "QUEUED" && j.status !== "RUNNING" && j.proposal?.days) setAccept((a) => (a.length ? a : j.proposal!.days.map((d) => d.date).filter((d) => !j.appliedDates.includes(d))));
      } catch (e) {
        if (!stop) {
          setLoadError(e instanceof Error ? e.message : "Couldn't load job status");
          timer = setTimeout(poll, 5000);
        }
      }
    };
    poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [jobId, tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    const r = await run(() => startPlanAction(tripId, scope, { dates: scope === "days" ? selDays : undefined, instruction: instruction || null }), { refresh: false });
    if (r) {
      setJob(null);
      setAccept([]);
      setJobId(r.jobId);
      router.replace(`/trips/${tripId}/plan?job=${r.jobId}`, { scroll: false });
    }
  }

  const running = job && (job.status === "QUEUED" || job.status === "RUNNING");
  const issues = job?.checks?.issues ?? [];
  const blocking = props.missing.length > 0;

  return (
    <div className="space-y-6">
      {props.canEdit && !running && (
        <Card id="plan-form">
          <h2 className="font-display text-xl font-semibold">{props.hasPlan ? "Regenerate with AI" : "Draft my itinerary"}</h2>
          {blocking ? (
            <Notice tone="warn" title="A few essentials are needed first" className="mt-3">
              <ul className="list-disc pl-5">{props.missing.map((m) => <li key={m.field}>{m.question}</li>)}</ul>
              <Link href={`/trips/${tripId}/settings#details`} className="mt-2 inline-block font-semibold underline">Add them in trip settings</Link>
            </Notice>
          ) : (
            <div className="mt-3 space-y-4">
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">What to plan</legend>
                {(["full", "days"] as const).map((s) => (
                  <label key={s} className={cx("flex min-h-11 cursor-pointer items-center rounded-xl border px-4 text-sm font-medium", scope === s ? "border-accent bg-accent-soft text-accent-ink" : "border-line")}>
                    <input type="radio" name="scope" className="sr-only" checked={scope === s} onChange={() => setScope(s)} />
                    {s === "full" ? "Whole trip" : "Selected days only"}
                  </label>
                ))}
              </fieldset>
              {scope === "days" && (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Days to regenerate</legend>
                  <div className="flex flex-wrap gap-2">
                    {props.days.map((d) => {
                      const on = selDays.includes(d.date);
                      return (
                        <label key={d.date} className={cx("flex min-h-11 cursor-pointer items-center rounded-xl border px-3 text-sm", on ? "border-accent bg-accent-soft text-accent-ink" : "border-line")}>
                          <input type="checkbox" className="sr-only" checked={on} onChange={() => setSelDays(on ? selDays.filter((x) => x !== d.date) : [...selDays, d.date])} />
                          {formatDate(d.date)}{d.stops ? ` · ${d.stops}` : ""}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              <Field label="Anything specific for this draft? (optional)" htmlFor="instr">
                <Textarea id="instr" value={instruction} maxLength={500} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. keep mornings slow, include a cooking class" />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={start} disabled={pending || !props.aiReady || (scope === "days" && !selDays.length)}>
                  {pending ? "Starting…" : "✨ Plan with AI"}
                </Button>
                <p className="text-xs text-muted">{props.aiReady ? `Uses OpenAI ${props.model}${props.webSearch ? " with web search for opening hours and official links" : ""}. Takes about 1–4 minutes. Your current itinerary stays as it is until you accept.` : "Unavailable: OpenAI isn't configured on this server."}</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {loadError && <Notice tone="danger">{loadError}</Notice>}
      {jobId && !job && !loadError && <Spinner label="Loading planning status…" />}

      {job && (
        <Card aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">
              {job.status === "QUEUED" && "Waiting to start"}
              {job.status === "RUNNING" && "Planning your trip"}
              {job.status === "SUCCEEDED" && (job.kind === "swap" ? "Alternatives ready" : "Draft ready for review")}
              {job.status === "FAILED" && "Planning stopped"}
              {job.status === "CANCELLED" && "Planning cancelled"}
            </h2>
            {running && props.canEdit && (
              <Button variant="ghost" disabled={job.cancelRequested} onClick={() => run(() => cancelPlanAction(tripId, job.id), { refresh: false })}>
                {job.cancelRequested ? "Cancelling…" : "Cancel"}
              </Button>
            )}
          </div>
          <ol className="mt-3 space-y-1.5 text-sm">
            {job.progress.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-14 shrink-0 font-mono text-xs text-muted">{new Date(p.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                <span>{p.message}</span>
              </li>
            ))}
            {running && <li><Spinner label={job.status === "QUEUED" ? "Waiting for the planning worker…" : "Working — this step can take a few minutes"} /></li>}
          </ol>
          {job.status === "QUEUED" && <p className="mt-2 text-xs text-muted">Jobs are processed by Tripanize's background worker. If this stays queued for more than a minute, the worker may not be running on this server.</p>}
          {job.status === "FAILED" && <Notice tone="danger" className="mt-3" title="The AI plan wasn't created">{job.error}{job.error && /unchanged|not changed/.test(job.error) ? "" : " Your itinerary was not changed."}</Notice>}
        </Card>
      )}

      {job?.proposal?.days && job.kind !== "swap" && (
        <section aria-labelledby="review" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="review" className="font-display text-xl font-semibold">Review the draft</h2>
              {job.proposal.summary && <p className="mt-1 max-w-2xl text-sm text-muted">{job.proposal.summary}</p>}
              <p className="mt-1 text-xs text-muted">Times, prices, travel estimates and opening hours are AI estimates unless marked verified. Nothing is booked.</p>
            </div>
          </div>
          {issues.filter((i) => !i.date).map((i, k) => (
            <Notice key={k} tone={i.severity === "conflict" ? "danger" : i.severity === "warning" ? "warn" : "neutral"}>{i.message}</Notice>
          ))}
          {job.proposal.unplacedMustSees.length > 0 && (
            <Notice tone="warn" title="Must-sees that didn't fit">
              {job.proposal.unplacedMustSees.map((u) => (
                <div key={u.name}>
                  <p><strong>{u.name}</strong>: {u.reason}</p>
                  {u.options.length > 0 && <ul className="list-disc pl-5">{u.options.map((o) => <li key={o}>{o}</li>)}</ul>}
                </div>
              ))}
            </Notice>
          )}
          {job.proposal.generalNotes.length > 0 && <Notice title="Notes">{job.proposal.generalNotes.map((n, i) => <p key={i}>{n}</p>)}</Notice>}
          <div className="grid gap-4">
            {job.proposal.days.map((d) => (
              <DayReview key={d.date} d={d} existingStops={props.days.find((x) => x.date === d.date)?.stops ?? 0} checked={accept.includes(d.date)} applied={job.appliedDates.includes(d.date)} issues={issues.filter((i) => i.date === d.date)} onToggle={() => setAccept(accept.includes(d.date) ? accept.filter((x) => x !== d.date) : [...accept, d.date])} />
            ))}
          </div>
          {job.checks?.sources?.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Web sources consulted ({job.checks.sources.length})</summary>
              <ul className="mt-2 space-y-1">{job.checks.sources.map((s) => <li key={s} className="truncate"><ExternalLink href={s}>{s}</ExternalLink></li>)}</ul>
            </details>
          ) : null}
          {props.canEdit && (
            <div className="sticky bottom-20 z-10 flex flex-wrap justify-end gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
              <Button onClick={() => setAccept(job.proposal!.days.map((d) => d.date))}>Select all</Button>
              <Button
                variant="primary"
                disabled={!accept.length || pending}
                onClick={async () => {
                  const r = await run(() => applyPlanAction(tripId, job.id, accept), { success: `Saved ${accept.length} day(s) to your itinerary` });
                  if (r) router.push(`/trips/${tripId}/itinerary`);
                }}
              >
                {accept.length === job.proposal.days.length ? "Accept full draft" : `Accept ${accept.length} selected day${accept.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          )}
          <p className="text-center text-sm"><LinkButton href={`/trips/${tripId}/itinerary`} variant="ghost">Back to itinerary without saving</LinkButton></p>
        </section>
      )}
    </div>
  );
}
