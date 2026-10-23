import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { getTripPlan } from "@/server/plans/access";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { createTrip, updateTrip } from "./service";
import { tripInput, type TripInput } from "./schemas";
import { enqueueJob } from "@/server/planner/jobs";
import { getPlanQuestions, savePlanPrefs } from "@/server/planner/questions";
import { applyProposal } from "@/server/planner/apply";
import { refreshSuggestions } from "@/server/packing/service";
import type { Generator } from "@/server/planner/run";
import type { Proposal } from "@/server/planner/schema";

export async function createTripDraft(userId: string, name: string) {
  const id = await createTrip(userId, { name });
  await prisma.trip.update({ where: { id }, data: { onboardingStage: "PLAN" } });
  return { id };
}

export async function chooseNormal(userId: string, tripId: string) {
  await requireTrip(tripId, userId, "manage");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  const plan = await getTripPlan(tripId);
  if (plan.premium && !plan.preview) return { next: `/trips/${tripId}/${trip.onboardingStage === "COMPLETE" ? "itinerary" : "onboarding"}` };
  if (trip.onboardingStage === "PLAN") await prisma.trip.update({ where: { id: tripId }, data: { onboardingStage: "DETAILS", onboardingPlan: "NORMAL", selectedPremiumFeatures: [] } });
  return { next: `/trips/${tripId}/${trip.onboardingStage === "COMPLETE" ? "itinerary" : "onboarding"}` };
}

export async function saveOnboardingDetails(userId: string, tripId: string, input: TripInput, version: number) {
  await requireTrip(tripId, userId, "manage");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  if (!["DETAILS", "QUESTIONS"].includes(trip.onboardingStage)) throw new AppError("CONFLICT", "Choose a plan before entering trip details.");
  if (trip.onboardingPlan === "PREMIUM" && !(await getTripPlan(tripId)).premium) throw new AppError("FORBIDDEN", "Complete Premium payment before continuing.");
  const parsed = tripInput.safeParse(input);
  if (!parsed.success || !parsed.data.startDate || !parsed.data.endDate || !parsed.data.destinations.length) throw new AppError("VALIDATION", "Add your destination and both trip dates before continuing.");
  if (parsed.data.destinations.length > 1 && parsed.data.destinations.some(d => !d.arriveDate || !d.departDate)) throw new AppError("VALIDATION", "Add arrival and departure dates for each destination.");
  await updateTrip(userId, tripId, input, version);
  await prisma.trip.update({ where: { id: tripId }, data: { onboardingStage: "QUESTIONS", planQuestions: Prisma.DbNull } });
  await getPlanQuestions(userId, tripId);
}

export async function startOnboardingPlan(userId: string, tripId: string, input: { answers: { q: string; a: string[] }[]; note: string | null }) {
  await requireTrip(tripId, userId, "manage");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  if (trip.onboardingStage === "GENERATING" && trip.onboardingJobId) return { jobId: trip.onboardingJobId };
  if (trip.onboardingStage !== "QUESTIONS") throw new AppError("CONFLICT", "Complete your trip details first.");
  const questions = await getPlanQuestions(userId, tripId, { poll: true });
  if (questions.pendingJobId) throw new AppError("CONFLICT", "Your tailored questions are still being prepared.");
  if (questions.questions.some(q => !input.answers.some(a => a.q === q.q && a.a.some(v => q.options.includes(v))))) throw new AppError("VALIDATION", "Choose an answer to each question so we can tailor your trip.");
  await savePlanPrefs(userId, tripId, input);
  const result = await enqueueJob(userId, tripId, "full", { onboarding: true });
  await prisma.trip.update({ where: { id: tripId }, data: { onboardingStage: "GENERATING", onboardingJobId: result.jobId } });
  return result;
}

export async function onboardingState(userId: string, tripId: string) {
  const access = await requireTrip(tripId, userId);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { onboardingStage: true, onboardingJobId: true } });
  const job = trip.onboardingJobId ? await prisma.generationJob.findFirst({ where: { id: trip.onboardingJobId, tripId }, select: { id: true, status: true, progress: true, error: true } }) : null;
  return { ...trip, job, isOwner: access.role === "OWNER" };
}

export async function retryOnboarding(userId: string, tripId: string) {
  await requireTrip(tripId, userId, "manage");
  const state = await onboardingState(userId, tripId);
  if (!state.job || !["FAILED", "CANCELLED"].includes(state.job.status)) throw new AppError("CONFLICT", "This trip is already being prepared.");
  await prisma.generationJob.update({ where: { id: state.job.id }, data: { status: "QUEUED", requestedById: userId, error: null, errorCode: null, finishedAt: null, cancelRequested: false } });
  await currentRuntime().wakeAi?.();
}

/** A separate durable job makes applying the draft and preparing packing resumable. */
export async function finishOnboarding(jobId: string, generate: Generator) {
  const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
  await requireTrip(job.tripId, job.requestedById, "manage");
  const planJobId = (job.params as { planJobId?: string }).planJobId;
  const planJob = await prisma.generationJob.findFirst({ where: { id: planJobId ?? "", tripId: job.tripId, kind: "full", status: "SUCCEEDED" } });
  if (!planJob?.proposal) throw new AppError("CONFLICT", "The itinerary draft is not ready yet.");
  const log = async (message: string) => {
    const current = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    await prisma.generationJob.update({ where: { id: jobId }, data: { progress: [...(Array.isArray(current.progress) ? current.progress : []), { at: new Date().toISOString(), message }] as Prisma.InputJsonValue } });
  };
  if (!planJob.appliedAt) {
    const dates = (planJob.proposal as unknown as Proposal).days.map(d => d.date);
    if (await prisma.itineraryDay.count({ where: { tripId: job.tripId, date: { in: dates } } }) !== dates.length) throw new AppError("CONFLICT", "Trip dates changed after generation. Review the trip dates before retrying.");
    await log("Saving your itinerary. A restorable version is kept.");
    await applyProposal(job.requestedById, job.tripId, planJob.id, (planJob.proposal as unknown as Proposal).days.map(d => d.date));
  }
  if ((await getTripPlan(job.tripId)).premium) {
    const events = await prisma.tripEvent.findMany({ where: { tripId: job.tripId, status: { in: ["NEW", "SAVED"] }, cancelled: false } });
    for (const event of events) {
      const matching = await prisma.stop.findMany({ where: { tripId: job.tripId, origin: "AI", eventId: null, bookingId: null, title: event.title, dayId: { not: null } }, include: { day: { select: { date: true } } } });
      const eligible = matching.filter(s => event.date && s.day && s.day.date >= event.date && s.day.date <= (event.endDate ?? event.date));
      if (eligible.length === 1) await prisma.$transaction(async tx => {
        await tx.stop.update({ where: { id: eligible[0].id }, data: { eventId: event.id, officialUrl: event.bookingUrl ?? event.officialUrl, category: "event" } });
        await tx.tripEvent.update({ where: { id: event.id }, data: { status: "SCHEDULED" } });
      });
    }
  }
  if ((await getTripPlan(job.tripId)).premium) {
    await log("Customizing packing for the weather, season, local customs, events and your preferences.");
    await refreshSuggestions(job.requestedById, job.tripId, { laundry: null, personalized: true, generate });
  }
  await prisma.$transaction(async tx => {
    await tx.generationJob.update({ where: { id: jobId }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
    await tx.trip.update({ where: { id: job.tripId }, data: { onboardingStage: "COMPLETE" } });
  });
}
