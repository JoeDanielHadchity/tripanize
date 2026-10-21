import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { requireTrip, roleAllows } from "@/server/auth/permissions";
import { aiConfigured, aiModel, webSearchEnabled } from "@/server/ai/openai";
import { missingEssentials } from "@/server/planner/context";
import { latestJobs } from "@/server/planner/jobs";
import { LinkButton, Notice, PageHeader } from "@/components/ui";
import { PlanPanel } from "./panel";
import { PlanQuestions } from "./questions";
import type { PlanPrefs } from "@/server/planner/questions";
import { formatTimestamp } from "@/lib/dates";

export const metadata: Metadata = { title: "Plan with AI" };

export default async function PlanPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ start?: string; job?: string; days?: string }> }) {
  const { tripId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const access = await requireTrip(tripId, user.id, "view");
  const canEdit = roleAllows(access.role, "edit");
  const [trip, missing, jobs, days] = await Promise.all([
    prisma.trip.findUniqueOrThrow({ where: { id: tripId } }),
    missingEssentials(tripId),
    latestJobs(user.id, tripId),
    prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" }, select: { id: true, date: true, title: true, _count: { select: { stops: true } } } }),
  ]);
  const active = jobs.find((j) => j.status === "QUEUED" || j.status === "RUNNING");
  const focusJob = sp.job ?? active?.id ?? null;
  const hasPlan = days.some((d) => d._count.stops > 0);
  return (
    <>
      <PageHeader title="Plan with AI" subtitle={`ChatGPT drafts a day-by-day plan from this trip's details. Nothing changes in your itinerary until you review and accept it.`} />
      {sp.start && (
        <Notice tone="accent" title="Your trip is created" className="mb-5">
          <p>Choose how to start. You can switch any time.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="#plan-form" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-medium text-on-accent">Plan with AI</a>
            <LinkButton href={`/trips/${tripId}/itinerary`}>Start planning manually</LinkButton>
          </div>
        </Notice>
      )}
      {!aiConfigured() && (
        <Notice tone="warn" title="AI planning isn't available on this server yet" className="mb-5">
          <p>The server has no OpenAI API key configured (environment variable <code>OPENAI_API_KEY</code>), so “Plan with AI” can't run. Nothing will be simulated. Everything else — manual planning, bookings, expenses, packing, invitations — works normally.</p>
        </Notice>
      )}
      {!canEdit && <Notice tone="warn" className="mb-5">You have view-only access, so you can't start AI planning for this trip.</Notice>}
      <div className="mb-6">
        <PlanQuestions tripId={tripId} canEdit={canEdit} aiReady={aiConfigured()} prefs={(trip.planPrefs as PlanPrefs | null) ?? null} />
      </div>
      <PlanPanel
        tripId={tripId}
        canEdit={canEdit}
        aiReady={aiConfigured()}
        model={aiModel()}
        webSearch={webSearchEnabled()}
        missing={missing}
        days={days.map((d) => ({ date: d.date, title: d.title, stops: d._count.stops }))}
        hasPlan={hasPlan}
        initialJobId={focusJob}
        preselectDays={sp.days?.split(",").filter(Boolean) ?? []}
      />
      {jobs.length > 0 && (
        <section className="mt-10" aria-labelledby="hist">
          <h2 id="hist" className="font-display text-lg font-semibold">Recent planning runs</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  {formatTimestamp(j.createdAt, trip.timezone)} · {j.kind === "full" ? "Whole trip" : `${(j.params as { dates?: string[] }).dates?.length ?? 0} day(s)`} · <strong>{j.status.toLowerCase()}</strong>
                  {j.appliedAt ? ` · applied ${j.appliedDates.length} day(s)` : ""}
                  {j.error ? <span className="block text-muted">{j.error}</span> : null}
                </span>
                <a href={`/trips/${tripId}/plan?job=${j.id}`} className="min-h-11 content-center text-accent-ink underline">View</a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Every accepted plan saves a restorable version of your previous itinerary (see “Versions” on the itinerary page).</p>
        </section>
      )}
    </>
  );
}
