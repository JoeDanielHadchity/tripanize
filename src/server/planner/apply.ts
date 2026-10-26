import { readMealOptions } from "@/lib/meal-options";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { recordChange } from "@/server/audit";
import { currencyDigits } from "@/lib/money";
import { snapshotItinerary } from "@/server/itinerary/service";
import type { PlanStop, Proposal } from "./schema";
import type { Prisma } from "@/generated/prisma/client";
import { requirePlanDates } from "@/server/plans/planning";

export function planStopData(s: PlanStop, currency: string, position: number, plan: "A" | "B"): Omit<Prisma.StopUncheckedCreateInput, "tripId" | "dayId"> {
  const factor = 10 ** currencyDigits(currency);
  return {
    plan,
    position,
    title: s.title,
    category: s.category,
    locationName: s.locationName,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    reason: s.reason,
    startTime: s.startTime || null,
    durationMin: s.durationMin,
    travelToNextMin: s.travelToNextMin,
    travelMode: s.travelMode,
    travelNote: s.travelNote,
    officialUrl: s.officialUrl,
    sourceUrls: s.sourceUrls,
    estCostMinor: s.estCost === null ? null : Math.round(s.estCost * factor),
    currency,
    bookingRequired: s.bookingRequired,
    bookingNote: s.bookingNote,
    hoursNote: s.hoursVerified ? s.hoursNote : s.hoursNote ? (/not verified|unverified/i.test(s.hoursNote) ? s.hoursNote : `${s.hoursNote} (not verified)`) : "Opening hours not verified — check before going",
    isMeal: s.isMeal,
    isFreeTime: s.isFreeTime,
    indoor: s.indoor,
    // AI suggestions are never "confirmed"; only travelers' recorded bookings are.
    status: "SUGGESTED",
    origin: "AI",
  };
}

/**
 * Saves the accepted days of a proposal as editable records. Runs in one transaction after snapshotting the
 * current itinerary (so it can be undone). Fixed commitments, booking projections and traveler-scheduled events
 * on those days are kept untouched; other stops on accepted days are replaced. Unaccepted days are untouched.
 */
export async function applyProposal(userId: string, tripId: string, jobId: string, dates: string[]) {
  await requireTrip(tripId, userId, "edit");
  const job = await prisma.generationJob.findFirst({ where: { id: jobId, tripId } });
  if (!job || !job.proposal || !["full", "days"].includes(job.kind)) throw new AppError("NOT_FOUND", "There is no draft to apply.");
  if (job.status !== "SUCCEEDED" && job.status !== "FAILED" && job.status !== "CANCELLED") throw new AppError("VALIDATION", "This draft is still being generated.");
  const proposal = job.proposal as unknown as Proposal;
  const chosen = proposal.days.filter((d) => dates.includes(d.date));
  if (!chosen.length) throw new AppError("VALIDATION", "Select at least one day to accept.");
  await requirePlanDates(tripId, job.kind, chosen.map(d => d.date));
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  const factor = 10 ** currencyDigits(trip.currency);

  await prisma.$transaction(
    async (tx) => {
      await snapshotItinerary(tx, tripId, `Before applying AI plan (${chosen.length} day${chosen.length > 1 ? "s" : ""})`, userId);
      for (const d of chosen) {
        const day = await tx.itineraryDay.findUnique({ where: { tripId_date: { tripId, date: d.date } } });
        if (!day) continue; // trip dates changed since generation
        await tx.stop.deleteMany({ where: { dayId: day.id, isFixed: false, bookingId: null, eventId: null } });
        const kept = await tx.stop.findMany({ where: { dayId: day.id }, include: { booking: true } });
        const planA = [
          ...kept.filter((k) => k.plan === "A").map((k) => ({ kind: "keep" as const, id: k.id, time: (k.booking?.startTime ?? k.startTime) || "99:99" })),
          ...d.stops.map((s, i) => ({ kind: "new" as const, i, time: s.startTime || "99:99" })),
        ].sort((a, b) => a.time.localeCompare(b.time));
        for (const [pos, item] of planA.entries()) {
          if (item.kind === "keep") await tx.stop.update({ where: { id: item.id }, data: { position: pos } });
          else await tx.stop.create({ data: { ...planStopData(d.stops[item.i], trip.currency, pos, "A"), tripId, dayId: day.id, createdById: userId } });
        }
        for (const [i, s] of d.planB.entries()) await tx.stop.create({ data: { ...planStopData(s, trip.currency, i, "B"), tripId, dayId: day.id, createdById: userId } });
        await tx.itineraryDay.update({
          where: { id: day.id },
          data: {
            title: d.title || null,
            area: d.area || null,
            notes: d.notes.join("\n") || null,
            questions: d.questions,
            mealOptions: readMealOptions(d.meals),
            isTravelDay: d.isTravelDay || day.isTravelDay,
            driveMinutes: d.driveMinutes,
            planBNote: d.planBNote,
            activePlan: "A",
            estCostMinor: d.estCost === null ? null : Math.round(d.estCost * factor),
            version: { increment: 1 },
          },
        });
      }
      await tx.generationJob.update({ where: { id: jobId }, data: { appliedAt: new Date(), appliedDates: [...new Set([...job.appliedDates, ...chosen.map((d) => d.date)])] } });
      await recordChange(tx, { tripId, actorId: userId, entity: "itinerary", entityId: tripId, action: "apply_ai", after: { jobId, dates: chosen.map((d) => d.date) } });
    },
    { timeout: 30_000 },
  );
  return { applied: chosen.length };
}
