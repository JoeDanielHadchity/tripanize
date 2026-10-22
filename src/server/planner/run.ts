import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { AIError, aiModel, generateStructured } from "@/server/ai/openai";
import { buildContext, missingEssentials } from "./context";
import { buildPlannerInput, PLANNER_INSTRUCTIONS, SWAP_INSTRUCTIONS } from "./prompt";
import { ProposalSchema, SwapSchema, type PlanDay, type Proposal } from "./schema";
import { checkProposal, type Issue } from "./checks";
import { effectiveStop, stopInclude } from "@/server/itinerary/service";
import type { JobParams } from "./jobs";
import { generatePlanQuestions } from "./questions";
import { requireTrip } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { planningScope, requirePlanDates } from "@/server/plans/planning";

export type Generator = typeof generateStructured;
export type PlanCheckpoint = { dates: string[]; completedDates: string[]; proposal: Proposal; sources: string[] };
export type Checkpoints = { load: () => Promise<PlanCheckpoint | undefined>; save: (value: PlanCheckpoint) => Promise<void> };

const CHUNK_DAYS = 5;

async function progress(jobId: string, message: string) {
  const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId }, select: { progress: true } });
  const list = (job.progress as { at: string; message: string }[]) ?? [];
  await prisma.generationJob.update({ where: { id: jobId }, data: { progress: [...list, { at: new Date().toISOString(), message }] as Prisma.InputJsonValue } });
}

/** Aborts the in-flight AI call when a traveler presses Cancel. */
function watchCancel(jobId: string, controller: AbortController) {
  const timer = setInterval(async () => {
    try {
      const j = await prisma.generationJob.findUnique({ where: { id: jobId }, select: { cancelRequested: true } });
      if (j?.cancelRequested) controller.abort();
    } catch {
      /* ignore */
    }
  }, 2000);
  return () => clearInterval(timer);
}

/** Claims a queued job atomically; returns false if another worker already took it. */
export async function claimJob(jobId: string) {
  const res = await prisma.generationJob.updateMany({ where: { id: jobId, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date(), model: aiModel() } });
  return res.count === 1;
}

/**
 * Runs a planning job. The proposal is stored on the job only — the itinerary itself is never modified here,
 * so a failed, cancelled or partial generation cannot erase existing plans.
 */
export async function runJob(jobId: string, generate: Generator = generateStructured, checkpoint?: Checkpoints) {
  const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
  const params = job.params as JobParams;
  const controller = new AbortController();
  const stop = watchCancel(jobId, controller);
  const partialDays: PlanDay[] = [];
  let partialMeta: Pick<Proposal, "summary" | "unplacedMustSees" | "generalNotes"> = { summary: "", unplacedMustSees: [], generalNotes: [] };
  try {
    await requireTrip(job.tripId, job.requestedById, job.kind === "assistant" ? "view" : "edit");
    const scope = await planningScope(job.tripId, job.kind, params.dates);
    const saved = await checkpoint?.load();
    if (saved) {
      const restored = ProposalSchema.parse(saved.proposal);
      partialDays.push(...restored.days);
      partialMeta = { summary: restored.summary, unplacedMustSees: restored.unplacedMustSees, generalNotes: restored.generalNotes };
    }
    if (job.cancelRequested) throw new AIError("CANCELLED", "Generation was cancelled.");
    if (job.kind === "assistant") {
      const { runAssistantJob } = await import("@/server/assistant/service");
      return await runAssistantJob(jobId, generate, controller.signal);
    }
    if (job.kind === "questions") {
      await generatePlanQuestions(job.tripId, generate, controller.signal);
      await prisma.generationJob.update({ where: { id: jobId }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
      return;
    }
    if (job.kind === "swap") return await runSwap(jobId, job.tripId, params, generate, controller.signal);

    const missing = await missingEssentials(job.tripId);
    if (missing.length) throw new AIError("INVALID_RESPONSE", `Missing essentials: ${missing.map((m) => m.question).join(" ")}`);
    const ctx = await buildContext(job.tripId, scope);
    if (!ctx.dates.length) throw new AIError("INVALID_RESPONSE", "None of the selected days are within the trip dates.");
    if (saved && JSON.stringify(saved.dates) !== JSON.stringify(ctx.dates)) {
      partialDays.length = 0;
      throw new AIError("INVALID_RESPONSE", "Trip dates changed during planning. Start a new draft; your itinerary is unchanged.");
    }
    const completedDates = new Set(saved?.completedDates ?? []);
    const forecast = ctx.weather ? Object.values(ctx.weather.byDate).filter((w) => w.kind === "forecast").length : 0;
    const typical = ctx.weather ? Object.values(ctx.weather.byDate).filter((w) => w.kind === "typical").length : 0;
    await progress(jobId, `Collected trip details: ${ctx.dates.length} day${ctx.dates.length > 1 ? "s" : ""} to plan, ${ctx.destinations.length} destination${ctx.destinations.length === 1 ? "" : "s"}, ${ctx.anchors.length} fixed item${ctx.anchors.length === 1 ? "" : "s"} to plan around`);
    await progress(jobId, ctx.weather && forecast + typical ? `Weather: live forecast for ${forecast} day(s), typical conditions for ${typical} day(s)` : "Weather data unavailable — planning without it");
    if (ctx.legs.length) await progress(jobId, `Estimated ${ctx.legs.length} travel leg(s) between destinations`);

    const chunks: string[][] = [];
    const remaining = ctx.dates.filter((date) => !completedDates.has(date));
    for (let i = 0; i < remaining.length; i += CHUNK_DAYS) chunks.push(remaining.slice(i, i + CHUNK_DAYS));
    const allSources = new Set<string>(saved?.sources ?? []);
    for (const chunk of chunks) {
      await requirePlanDates(job.tripId, job.kind, ctx.dates);
      if (controller.signal.aborted || (await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } })).cancelRequested) throw new AIError("CANCELLED", "Generation was cancelled.");
      await progress(jobId, ctx.dates.length > CHUNK_DAYS ? `Planning ${chunk[0]} – ${chunk[chunk.length - 1]} (${completedDates.size} of ${ctx.dates.length} days drafted)` : "Researching places and drafting your itinerary");
      const res = await generate({
        schema: ProposalSchema,
        name: "trip_plan",
        instructions: PLANNER_INSTRUCTIONS,
        input: buildPlannerInput(ctx, { chunkDates: chunk, previouslyPlanned: partialDays.map((d) => ({ date: d.date, titles: d.stops.map((s) => s.title) })), extraInstruction: params.instruction }),
        webSearch: true,
        signal: controller.signal,
      });
      await requirePlanDates(job.tripId, job.kind, ctx.dates);
      if (controller.signal.aborted || (await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } })).cancelRequested) throw new AIError("CANCELLED", "Generation was cancelled.");
      res.sources.forEach((s) => allSources.add(s));
      partialDays.push(...res.data.days.filter((d) => chunk.includes(d.date)));
      partialMeta = {
        summary: [partialMeta.summary, res.data.summary].filter(Boolean).join(" "),
        unplacedMustSees: [...partialMeta.unplacedMustSees, ...res.data.unplacedMustSees.filter((u) => !partialMeta.unplacedMustSees.some((x) => x.name === u.name))],
        generalNotes: [...new Set([...partialMeta.generalNotes, ...res.data.generalNotes])],
      };
      chunk.forEach((date) => completedDates.add(date));
      if (checkpoint) await checkpoint.save({ dates: ctx.dates, completedDates: [...completedDates], proposal: { ...partialMeta, days: partialDays }, sources: [...allSources] });
      await progress(jobId, `Received ${res.data.days.length} day(s) from the AI${res.sources.length ? `, citing ${res.sources.length} web source(s)` : ""}`);
      // Resume the next section in a fresh durable alarm. Completed sections are
      // not sent to the model again after an instance restart.
      if (checkpoint && completedDates.size < ctx.dates.length) return;
    }

    // Must-sees placed on days outside this regeneration count as placed.
    const elsewhere = ctx.otherDaysPlanned.flatMap((d) => d.stops);
    const mustSee = ctx.trip.places.filter((p) => p.kind === "MUST_SEE").map((p) => p.name).filter((m) => job.kind === "full" || !elsewhere.some((t) => t.toLowerCase().includes(m.toLowerCase())));
    const { proposal, issues } = checkProposal({ ...partialMeta, days: partialDays }, { dates: ctx.dates, anchors: ctx.anchors, mustSee, arrivalAt: ctx.trip.arrivalAt, departureAt: ctx.trip.departureAt });
    await progress(jobId, `Checked dates, timing, fixed commitments and must-sees: ${issues.filter((i) => i.severity === "conflict").length} conflict(s), ${issues.filter((i) => i.severity === "warning").length} warning(s)`);
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "SUCCEEDED", finishedAt: new Date(), proposal: proposal as unknown as Prisma.InputJsonValue, checks: { issues, sources: [...allSources].slice(0, 50) } as unknown as Prisma.InputJsonValue },
    });
    await progress(jobId, "Draft ready for review");
  } catch (err) {
    const e = err instanceof AIError ? err : new AIError("UPSTREAM", err instanceof AppError ? err.message : "Unexpected error while planning.");
    if (err instanceof AppError && err.code === "FORBIDDEN") partialDays.length = 0;
    if (!(err instanceof AIError) && !(err instanceof AppError)) console.error("[planner] unexpected", err instanceof Error ? err.message : err);
    const cancelled = e.code === "CANCELLED";
    // Keep any completed chunks as a partial result the travelers can review.
    let partial: { proposal: Proposal; issues: Issue[] } | null = null;
    if (partialDays.length && job.kind !== "swap") {
      const ctxDates = partialDays.map((d) => d.date);
      partial = checkProposal({ ...partialMeta, days: partialDays }, { dates: ctxDates, anchors: [], mustSee: [], arrivalAt: null, departureAt: null });
      partial.issues.unshift({ date: null, severity: "warning", message: `Partial result: only ${partialDays.length} day(s) were generated before the job stopped. Fixed-item checks are limited for partial results — review carefully.` });
    }
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: cancelled ? "CANCELLED" : "FAILED",
        finishedAt: new Date(),
        error: e.message,
        errorCode: e.code,
        ...(partial ? { proposal: partial.proposal as unknown as Prisma.InputJsonValue, checks: { issues: partial.issues, sources: [] } as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    await progress(jobId, cancelled ? "Cancelled — your itinerary was not changed" : `Stopped: ${e.message}${/unchanged|not changed/.test(e.message) ? "" : " Your itinerary was not changed."}`);
  } finally {
    stop();
  }
}

async function runSwap(jobId: string, tripId: string, params: JobParams, generate: Generator, signal: AbortSignal) {
  const stopRow = await prisma.stop.findFirst({ where: { id: params.stopId!, tripId }, include: { day: { include: { destination: true, stops: { include: stopInclude, orderBy: { position: "asc" } } } } } });
  if (!stopRow) throw new AIError("INVALID_RESPONSE", "The stop to swap no longer exists.");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  await progress(jobId, `Looking for alternatives to “${stopRow.title}”`);
  const dayStops = stopRow.day?.stops ?? [];
  const idx = dayStops.findIndex((s) => s.id === stopRow.id);
  const next = dayStops.slice(idx + 1).find((s) => s.status !== "SKIPPED");
  const prev = dayStops.slice(0, Math.max(0, idx)).reverse().find((s) => s.status !== "SKIPPED");
  let weather: unknown = null;
  if (stopRow.day) {
    try {
      const { getTripWeather } = await import("@/server/weather/trip");
      weather = (await getTripWeather(tripId)).byDate[stopRow.day.date] ?? null;
    } catch {
      weather = null;
    }
  }
  const data = {
    replace: { title: stopRow.title, category: stopRow.category, address: stopRow.address, locationName: stopRow.locationName, startTime: stopRow.startTime, durationMin: stopRow.durationMin, estCost: stopRow.estCostMinor, lat: stopRow.lat, lng: stopRow.lng },
    date: stopRow.day?.date ?? null,
    destination: stopRow.day?.destination?.name ?? null,
    previousStop: prev ? { title: effectiveStop(prev).title, address: effectiveStop(prev).address, endsAround: prev.startTime } : null,
    nextStop: next ? { title: effectiveStop(next).title, address: effectiveStop(next).address, startsAt: effectiveStop(next).startTime, fixed: next.isFixed || Boolean(next.bookingId) } : null,
    otherStopsToday: dayStops.filter((s) => s.id !== stopRow.id).map((s) => effectiveStop(s).title),
    interests: trip.interests,
    accessibility: trip.accessibility,
    currency: trip.currency,
    budget: trip.budgetMinor,
    travelers: { adults: trip.adults, children: trip.children },
    weather,
    travelerRequest: params.instruction ?? null,
  };
  const res = await generate({ schema: SwapSchema, name: "swap", instructions: SWAP_INSTRUCTIONS, input: `<trip_data>\n${JSON.stringify(data, null, 1)}\n</trip_data>`, webSearch: true, signal, timeoutMs: 3 * 60_000, maxOutputTokens: 12000 });
  const checked = checkProposal(
    { summary: "", unplacedMustSees: [], generalNotes: [], days: [{ date: "2000-01-01", area: "", title: "", isTravelDay: false, driveMinutes: null, stops: res.data.alternatives, planB: [], planBNote: null, notes: [], questions: [], estCost: null }] },
    { dates: ["2000-01-01"], anchors: [], mustSee: [], arrivalAt: null, departureAt: null },
  );
  const alternatives = checked.proposal.days[0]?.stops.map((s) => ({ ...s, startTime: stopRow.startTime ?? s.startTime })) ?? [];
  await prisma.generationJob.update({ where: { id: jobId }, data: { status: "SUCCEEDED", finishedAt: new Date(), proposal: { alternatives, note: res.data.note } as unknown as Prisma.InputJsonValue, checks: { issues: [], sources: res.sources.slice(0, 20) } as Prisma.InputJsonValue } });
  await progress(jobId, `Found ${alternatives.length} alternative(s)`);
}

/** Marks jobs whose worker died mid-run as failed (they never touched the itinerary). */
export async function failStaleJobs() {
  const cutoff = new Date(Date.now() - 20 * 60_000);
  await prisma.generationJob.updateMany({ where: { status: "RUNNING", startedAt: { lt: cutoff } }, data: { status: "FAILED", finishedAt: new Date(), error: "The planning worker stopped unexpectedly. Your itinerary was not changed — please try again.", errorCode: "UPSTREAM" } });
}
