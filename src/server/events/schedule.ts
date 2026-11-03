import { addDays, daysBetween, todayIn, zonedToUtc } from "@/lib/dates";
import { prisma } from "@/server/db";
import { aiConfigured, webSearchEnabled } from "@/server/ai/openai";
import { getTripPlan } from "@/server/plans/access";
import { currentRuntime } from "@/server/cloudflare/runtime";

type Dates = { startDate: string | null; endDate: string | null; timezone: string };
/**
 * Automatic event checks: at most 10 per trip, free, on these days before the trip starts
 * (0 = the first morning of the trip). They get closer together near the trip, when most local
 * events are announced. A trip booked late only gets the checks still ahead. People can still
 * ask for an event search at any time (that one costs credits).
 */
export const CHECK_DAYS_BEFORE = [45, 30, 21, 14, 10, 7, 5, 3, 1, 0] as const;
export const MAX_AUTOMATIC_CHECKS = CHECK_DAYS_BEFORE.length;
export const FIRST_CHECK_DAYS = CHECK_DAYS_BEFORE[0];
export function automaticSearchDay(date: string, startDate: string) {
  return (CHECK_DAYS_BEFORE as readonly number[]).includes(daysBetween(date, startDate));
}
export function discoveryCadence(trip: Dates, now = new Date()) {
  if (!trip.startDate || !trip.endDate) return "Add dates to start automatic checks";
  const today = todayIn(trip.timezone, now);
  if (trip.endDate < today) return "Trip ended · automatic checks stopped";
  if (trip.startDate < today) return "Automatic checks finished · search for events any time";
  if (trip.startDate === today) return "Last automatic check this morning";
  return daysBetween(today, trip.startDate) > FIRST_CHECK_DAYS ? "Automatic checks start 45 days before the trip" : "Up to 10 automatic checks before the trip";
}
/** The next check day's local 09:00 after `after`, from 45 days before the trip to its first morning. */
export function nextDiscoveryAt(trip: Dates, after: Date): Date | null {
  if (!trip.startDate || !trip.endDate) return null;
  let date = todayIn(trip.timezone, after);
  const first = addDays(trip.startDate, -FIRST_CHECK_DAYS);
  if (date < first) date = first;
  for (; date <= trip.startDate; date = addDays(date, 1)) {
    if (!automaticSearchDay(date, trip.startDate)) continue;
    const slot = zonedToUtc(`${date}T09:00`, trip.timezone);
    if (slot > after) return slot;
  }
  return null;
}
/** A trip's first automatic check: today if today is a check day, else the next check day. */
function firstDiscoveryAt(trip: Dates, now: Date): Date | null {
  const today = todayIn(trip.timezone, now);
  if (trip.startDate && automaticSearchDay(today, trip.startDate)) return now;
  return nextDiscoveryAt(trip, now);
}
export async function queueDueDiscoveries(now = new Date()) {
  if (!aiConfigured() || !webSearchEnabled()) return 0;
  // The last automatic check is on the trip's first morning. Trips that started more than
  // two days ago (any time zone) are never due again, so the hourly scan skips them.
  const started = addDays(now.toISOString().slice(0, 10), -2);
  const trips = await prisma.trip.findMany({ where: { autoDiscovery: true, startDate: { not: null, gte: started }, endDate: { not: null } }, include: { destinations: { select: { id: true } } } });
  let queued = 0;
  for (const trip of trips) {
    const today = todayIn(trip.timezone, now);
    const plan = await getTripPlan(trip.id);
    if (!plan.premium || plan.preview || trip.startDate! < today || !trip.destinations.length || !["COMPLETE", "GENERATING"].includes(trip.onboardingStage)) {
      if (trip.nextDiscoveryAt) await prisma.trip.update({ where: { id: trip.id }, data: { nextDiscoveryAt: null } });
      continue;
    }
    if (await prisma.discoveryRun.findFirst({ where: { tripId: trip.id, status: { in: ["queued", "running"] } } })) continue;
    const success = await prisma.discoveryRun.findFirst({ where: { tripId: trip.id, status: "succeeded" }, orderBy: { finishedAt: "desc" } });
    const failed = await prisma.discoveryRun.findFirst({ where: { tripId: trip.id, trigger: "scheduled", status: "failed" }, orderBy: { finishedAt: "desc" } });
    // At most 10 automatic checks per trip; failed ones don't use up the allowance.
    if (await prisma.discoveryRun.count({ where: { tripId: trip.id, trigger: "scheduled", status: { not: "failed" } } }) >= MAX_AUTOMATIC_CHECKS) {
      if (trip.nextDiscoveryAt) await prisma.trip.update({ where: { id: trip.id }, data: { nextDiscoveryAt: null } });
      continue;
    }
    let due = success?.finishedAt ? nextDiscoveryAt(trip, success.finishedAt) : firstDiscoveryAt(trip, now);
    if (due && failed?.finishedAt && (!success?.finishedAt || failed.finishedAt > success.finishedAt)) due = new Date(Math.max(due.getTime(), failed.finishedAt.getTime() + 6 * 3600_000));
    if (due && todayIn(trip.timezone, due) > trip.startDate!) due = null;
    await prisma.trip.update({ where: { id: trip.id }, data: { nextDiscoveryAt: due } });
    if (!due || due > now) continue;
    // HTTP maintenance owns the application lock; insert and advance together.
    await prisma.$transaction(async tx => {
      if (await tx.discoveryRun.findFirst({ where: { tripId: trip.id, status: { in: ["queued", "running"] } } })) return;
      await tx.discoveryRun.create({ data: { tripId: trip.id, trigger: "scheduled", requestedById: trip.ownerId } });
      await tx.trip.update({ where: { id: trip.id }, data: { nextDiscoveryAt: nextDiscoveryAt(trip, now) } });
      queued++;
    });
  }
  if (queued) await currentRuntime().wakeAi?.();
  return queued;
}
