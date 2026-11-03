import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { rateLimit } from "@/server/ratelimit";
import { aiConfigured } from "@/server/ai/openai";
import { missingEssentials } from "./context";
import type { Prisma } from "@/generated/prisma/client";
import { currentRuntime, normalUserMode } from "@/server/cloudflare/runtime";
import { planningScope } from "@/server/plans/planning";
import { getTripPlan, requirePremiumAccess } from "@/server/plans/access";
import { CREDIT_PRICES, planPrice } from "@/lib/credits";
import { attachHold, hold, settle, settleRef, type CreditAction } from "@/server/credits/service";

export type JobKind = "full" | "days" | "swap" | "restaurants";
export type JobParams = { dates?: string[]; stopId?: string; instruction?: string | null; onboarding?: boolean; eventsReady?: boolean; normalMode?: boolean; restaurantBaseHash?: string };

/**
 * Queues an AI job. Guards: AI must be configured (no simulated results), essentials must be present,
 * duplicate clicks return the job already in progress, and costly calls are rate-limited per user.
 */
export async function enqueueJob(userId: string, tripId: string, kind: JobKind, params: JobParams) {
  await requireTrip(tripId, userId, "edit");
  if (params.onboarding) {
    await requireTrip(tripId, userId, "manage");
    if (kind !== "full" || (await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).onboardingStage !== "QUESTIONS") throw new AppError("CONFLICT", "Complete guided setup before generating this trip.");
  }
  if (!["full", "days", "swap", "restaurants"].includes(kind)) throw new AppError("VALIDATION", "Choose a valid planning tool.");
  if (!aiConfigured()) {
    throw new AppError("NOT_CONFIGURED", "AI planning isn't available on this server yet: the administrator needs to set an OpenAI API key (OPENAI_API_KEY). You can still plan manually.");
  }
  if (kind !== "swap") {
    const missing = await missingEssentials(tripId);
    if (missing.length) throw new AppError("VALIDATION", "A few essentials are needed before planning.", { missing });
  }
  if (kind === "swap") {
    if (!params.stopId) throw new AppError("VALIDATION", "Choose a stop to swap.");
    const s = await prisma.stop.findFirst({ where: { id: params.stopId, tripId } });
    if (!s) throw new AppError("NOT_FOUND", "Stop not found.");
    if (s.isFixed || s.bookingId) throw new AppError("VALIDATION", "Fixed commitments and bookings can't be swapped.");
  }
  if (kind === "days" && !params.dates?.length) throw new AppError("VALIDATION", "Choose at least one day to regenerate.");
  const scope = await planningScope(tripId, kind, params.dates);

  const active = await prisma.generationJob.findFirst({
    where: { tripId, status: { in: ["QUEUED", "RUNNING"] }, kind: kind === "swap" ? "swap" : { in: ["full", "days", "restaurants"] }, ...(kind === "swap" ? { params: { path: "$.stopId", equals: params.stopId! } } : {}) },
  });
  if (active) {
    if ((active.kind === "restaurants" || kind === "restaurants") && active.kind !== kind) throw new AppError("CONFLICT", "Another planning task is running. Wait for it to finish before refreshing restaurants.");
    if (params.onboarding && !(active.params as JobParams).onboarding) throw new AppError("CONFLICT", "Another draft is being prepared. Wait for it to finish before starting guided setup."); await currentRuntime().wakeAi?.(); return { jobId: active.id, existing: true };
  }

  await rateLimit(`ai:${kind === "swap" ? "swap" : "plan"}:${userId}`, kind === "swap" ? 30 : 12, 3600, "You've reached the hourly limit for AI requests. Please try again later.");
  const restaurantBaseHash = kind === "restaurants" ? (await (await import("./restaurant-refresh")).restaurantRefreshState(prisma, tripId)).hash : undefined;
  // Credits are held now and settled when the job ends: spent on success, refunded on failure or cancel.
  const price = await jobPrice(tripId, kind, scope ?? params.dates ?? null, Boolean(params.onboarding));
  const held = await hold({ actorId: userId, tripId, action: price.action, credits: price.credits, refKind: "job" });
  let job;
  try {
    job = await prisma.generationJob.create({
      data: { tripId, kind, params: { dates: scope ?? params.dates ?? null, stopId: params.stopId ?? null, instruction: params.instruction?.slice(0, 500) ?? null, ...(restaurantBaseHash ? { restaurantBaseHash } : {}), ...(params.onboarding ? { onboarding: true } : {}), ...(normalUserMode(userId) ? { normalMode: true } : {}) } as Prisma.InputJsonValue, requestedById: userId, progress: [{ at: new Date().toISOString(), message: "Your trip is queued and will start shortly" }] },
    });
    await attachHold(held?.id, job.id);
  } catch (error) {
    await settle(held?.id, "refunded");
    throw error;
  }
  await currentRuntime().wakeAi?.();
  return { jobId: job.id, existing: false };
}

export async function getJob(userId: string, tripId: string, jobId: string) {
  await requireTrip(tripId, userId, "view");
  const job = await prisma.generationJob.findFirst({ where: { id: jobId, tripId } });
  if (!job) throw new AppError("NOT_FOUND", "Planning job not found.");
  if (!["full", "setup"].includes(job.kind)) await requirePremiumAccess(tripId, "advancedPlanning");
  if (job.kind === "assistant") {
    const { requireAssistantJob } = await import("@/server/assistant/service");
    return requireAssistantJob(userId, tripId, jobId);
  }
  return job;
}

export async function latestJobs(userId: string, tripId: string) {
  await requireTrip(tripId, userId, "view");
  return prisma.generationJob.findMany({ where: { tripId, kind: { in: ["full", "days"] } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, kind: true, status: true, createdAt: true, finishedAt: true, appliedAt: true, appliedDates: true, error: true, params: true } });
}

export async function cancelJob(userId: string, tripId: string, jobId: string) {
  await requireTrip(tripId, userId, "edit");
  const job = await prisma.generationJob.findFirst({ where: { id: jobId, tripId } });
  if (!job) throw new AppError("NOT_FOUND", "Job not found.");
  if (job.kind === "setup" || (job.params as JobParams).onboarding) await requireTrip(tripId, userId, "manage");
  if (job.kind === "assistant") {
    const { requireAssistantJob } = await import("@/server/assistant/service");
    await requireAssistantJob(userId, tripId, jobId);
  }
  if (job.status === "QUEUED") {
    await prisma.generationJob.updateMany({ where: { id: jobId, status: "QUEUED" }, data: { status: "CANCELLED", finishedAt: new Date(), cancelRequested: true } });
    await settleRef("job", jobId);
  } else if (job.status === "RUNNING") {
    await prisma.generationJob.update({ where: { id: jobId }, data: { cancelRequested: true } });
  }
}

/** The credits a planning job costs: per day planned (plus events and packing during Premium setup), or per swap. */
async function jobPrice(tripId: string, kind: JobKind, dates: string[] | null, onboarding: boolean): Promise<{ action: CreditAction; credits: number }> {
  if (kind === "swap") return { action: "swap", credits: CREDIT_PRICES.swap };
  const days = dates?.length ?? await prisma.itineraryDay.count({ where: { tripId } });
  if (kind === "restaurants") return { action: "restaurants", credits: Math.max(1, days) * CREDIT_PRICES.restaurantsDay };
  if (kind === "days") return { action: "regenerate", credits: planPrice(days) };
  return { action: "plan", credits: planPrice(days, { setup: onboarding, premium: onboarding && (await getTripPlan(tripId)).premium }) };
}
