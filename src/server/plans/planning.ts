import { prisma } from "@/server/db";
import { creditsCoverTrip } from "@/server/credits/service";
import { AppError } from "@/server/errors";
import { dateRange } from "@/lib/dates";
import { NORMAL_AI_DAYS } from "@/lib/plans";
import { getTripPlan, requirePremiumAccess } from "./access";

/** Persist calendar dates so repeated requests and date changes cannot extend the free allowance. */
export async function normalPlanningDates(tripId: string) {
  return prisma.$transaction(async tx => {
    const trip = await tx.trip.findUniqueOrThrow({ where: { id: tripId }, select: { startDate: true, endDate: true, normalAiDates: true } });
    const saved = Array.isArray(trip.normalAiDates) ? trip.normalAiDates.filter((d): d is string => typeof d === "string") : [];
    if (saved.length) return saved.slice(0, NORMAL_AI_DAYS);
    if (!trip.startDate || !trip.endDate) throw new AppError("VALIDATION", "Add your trip dates before planning with AI.");
    const dates = dateRange(trip.startDate, trip.endDate).slice(0, NORMAL_AI_DAYS);
    await tx.trip.update({ where: { id: tripId }, data: { normalAiDates: dates } });
    return dates;
  });
}

/**
 * Which dates an AI planning request may cover. Premium: any days (swaps stay Premium-only).
 * Free trips: a full draft covers the free plan's first 2 days; with credits, chosen days can be added.
 */
export async function planningScope(tripId: string, kind: string, dates?: string[]) {
  const premium = (await getTripPlan(tripId)).premium;
  if (kind === "swap" && !premium) throw new AppError("FORBIDDEN", "Stop alternatives require Premium for this trip. The trip organizer can upgrade for everyone.", { upgrade: true, feature: "advancedPlanning" });
  if (premium) return kind === "days" ? dates ?? [] : null;
  if (kind === "days" && await creditsCoverTrip(tripId)) return dates ?? [];
  if (kind !== "full") await requirePremiumAccess(tripId, "advancedPlanning");
  const allowed = await normalPlanningDates(tripId);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { startDate: true, endDate: true } });
  const current = allowed.filter(date => trip.startDate && trip.endDate && date >= trip.startDate && date <= trip.endDate);
  if (!current.length) throw new AppError("FORBIDDEN", "The free plan includes AI for the first 2 original trip dates. Upgrade to Premium to plan new dates with AI; you can still edit every day manually.", { upgrade: true });
  return current;
}

export async function requirePlanDates(tripId: string, kind: string, dates: string[]) {
  const allowed = await planningScope(tripId, kind, dates);
  if (allowed && dates.some(date => !allowed.includes(date))) {
    throw new AppError("FORBIDDEN", "Free AI planning is limited to the first 2 days of this trip. You can add the remaining days manually, or upgrade to Premium.", { upgrade: true });
  }
}
