import { createHash } from "node:crypto";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { requirePremiumAccess } from "@/server/plans/access";
import { effectiveStop, snapshotItinerary, stopInclude } from "@/server/itinerary/service";
import { recordChange } from "@/server/audit";
import { currencyDigits } from "@/lib/money";
import { RestaurantRegistry, uniqueMealOptions } from "@/lib/restaurant-diversity";
import type { PlanDay, PlanStop } from "./schema";
import type { Prisma } from "@/generated/prisma/client";
import { diningStop, stopRestaurantRef } from "./restaurants";

type Db = Pick<typeof prisma, "itineraryDay" | "trip">;
export async function restaurantRefreshState(db: Db, tripId: string) {
  const days = await db.itineraryDay.findMany({ where: { tripId }, include: { stops: { include: stopInclude, orderBy: [{ plan: "asc" }, { position: "asc" }, { id: "asc" }] } }, orderBy: { date: "asc" } });
  const trip = await db.trip.findUniqueOrThrow({ where: { id: tripId }, select: { revision: true, updatedAt: true } });
  const hash = createHash("sha256").update(JSON.stringify({ trip, days })).digest("hex");
  return { days, hash };
}

export async function restaurantRefreshInput(tripId: string, dates: string[], currency: string) {
  const { days } = await restaurantRefreshState(prisma, tripId);
  const factor = 10 ** currencyDigits(currency);
  const stopView = (s: typeof days[number]["stops"][number]): PlanStop => {
    const e = effectiveStop(s);
    return { title: e.title, category: s.category as PlanStop["category"], locationName: e.locationName, address: e.address,
      lat: s.lat, lng: s.lng, reason: s.reason ?? "", startTime: e.startTime ?? "", durationMin: e.durationMin ?? 60,
      travelToNextMin: s.travelToNextMin, travelMode: s.travelMode as PlanStop["travelMode"], travelNote: s.travelNote,
      estCost: e.estCostMinor === null ? null : e.estCostMinor / factor, bookingRequired: s.bookingRequired, bookingNote: s.bookingNote,
      hoursNote: s.hoursNote, hoursVerified: false, officialUrl: e.officialUrl, sourceUrls: s.sourceUrls,
      isMeal: s.isMeal, isFreeTime: s.isFreeTime, indoor: s.indoor };
  };
  const selected: PlanDay[] = days.filter(d => dates.includes(d.date)).map(d => ({
    date: d.date, title: d.title ?? "", area: d.area ?? "", isTravelDay: d.isTravelDay, driveMinutes: d.driveMinutes,
    stops: d.stops.filter(s => s.plan === "A" && s.status !== "SKIPPED").map(stopView),
    planB: d.stops.filter(s => s.plan === "B" && s.status !== "SKIPPED").map(stopView), planBNote: d.planBNote,
    notes: d.notes ? [d.notes] : [], questions: [], estCost: null, meals: { breakfast: [], lunch: [], dinner: [] },
  }));
  const excluded = days.flatMap(d => d.stops.filter(s => s.status !== "SKIPPED" && diningStop(s) && (s.origin !== "AI" || s.isFixed || s.bookingId || s.eventId)).map(s => stopRestaurantRef({ ...s, ...effectiveStop(s) })));
  return { days: selected, excluded };
}

/** A separate, undoable food-only refresh. No itinerary regeneration or booking writes. */
export async function saveRestaurantRefresh(opts: { tripId: string; userId: string; jobId: string; baseHash: string; days: PlanDay[]; sources: string[] }) {
  await requireTrip(opts.tripId, opts.userId, "edit");
  await requirePremiumAccess(opts.tripId, "advancedPlanning");
  return prisma.$transaction(async tx => {
    const current = await restaurantRefreshState(tx, opts.tripId);
    if (current.hash !== opts.baseHash) throw new AppError("CONFLICT", "Your itinerary changed during restaurant research. Start a fresh restaurant search; your itinerary was not changed.");
    const job = await tx.generationJob.findUniqueOrThrow({ where: { id: opts.jobId } });
    if (job.cancelRequested) throw new AppError("CONFLICT", "Restaurant research was cancelled. Your itinerary was not changed.");
    await snapshotItinerary(tx, opts.tripId, "Before refreshing restaurant options", opts.userId);
    const used = new RestaurantRegistry(current.days.flatMap(d => d.stops.filter(s => s.status !== "SKIPPED" && diningStop(s) && (s.origin !== "AI" || s.isFixed || s.bookingId || s.eventId)).map(s => stopRestaurantRef({ ...s, ...effectiveStop(s) }))));
    for (const proposed of opts.days) {
      const day = current.days.find(d => d.date === proposed.date);
      if (!day) continue;
      const meals = uniqueMealOptions(proposed.meals, used);
      await tx.itineraryDay.update({ where: { id: day.id }, data: { mealOptions: meals, version: { increment: 1 }, questions: [...day.questions.filter(q => !/sourced (breakfast|lunch|dinner)|restaurant research/i.test(q)), ...proposed.questions] } });
      for (const plan of ["A", "B"] as const) {
        const originals = day.stops.filter(s => s.plan === plan && s.status !== "SKIPPED");
        const replacements = plan === "A" ? proposed.stops : proposed.planB;
        for (const [index, original] of originals.entries()) {
          const replacement = replacements[index];
          if (!replacement || !diningStop(original) || original.origin !== "AI" || original.isFixed || original.bookingId || original.eventId) continue;
          await tx.stop.update({ where: { id: original.id }, data: {
            title: replacement.title, locationName: replacement.locationName, address: replacement.address, lat: null, lng: null,
            reason: replacement.reason, officialUrl: replacement.officialUrl, sourceUrls: replacement.sourceUrls,
            bookingNote: null, bookingRequired: false,
            hoursNote: replacement.hoursNote, estCostMinor: null, travelToNextMin: null, travelMode: null,
            travelNote: "Check travel time after choosing a restaurant.", version: { increment: 1 },
          } });
        }
      }
    }
    await tx.generationJob.update({ where: { id: opts.jobId }, data: { status: "SUCCEEDED", finishedAt: new Date(), appliedAt: new Date(), appliedDates: opts.days.map(d => d.date), checks: { sources: opts.sources.slice(0, 100) } as Prisma.InputJsonValue } });
    await recordChange(tx, { tripId: opts.tripId, actorId: opts.userId, entity: "itinerary", entityId: opts.tripId, action: "refresh_restaurants", after: { jobId: opts.jobId, dates: opts.days.map(d => d.date) } });
  }, { timeout: 30_000 });
}
