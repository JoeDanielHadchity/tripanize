import { prisma, type Tx } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { requireTrip, type Capability } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { PREMIUM_FEATURES, premiumBandForCredit, type PremiumFeature } from "@/lib/plans";
import { billingEnvironment } from "@/server/billing/config";

type Database = Pick<Tx, "trip" | "premiumCheckout">;
export function planAccessEnabled() { return currentRuntime().planAccessEnabled === true; }

/** Count people once: planned totals, named travelers, and account members may overlap. */
export async function tripPeople(tripId: string, db: Database = prisma) {
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { adults: true, children: true, travelers: { where: { leftAt: null }, select: { id: true } }, memberships: { select: { userId: true } } } });
  if (!trip) throw new AppError("NOT_FOUND", "Trip not found.");
  return Math.max(1, trip.adults + trip.children, trip.travelers.length, trip.memberships.length);
}

/** A verified one-time purchase covers this trip, including after an owner transfer. */
export async function getTripPlan(tripId: string, db: Database = prisma) {
  const people = await tripPeople(tripId, db);
  const purchases = await db.premiumCheckout.findMany({ where: { tripId, environment: billingEnvironment(), status: "COMPLETED" }, select: { amountMinor: true, reviewRequired: true } });
  const creditMinor = purchases.filter(p => !p.reviewRequired).reduce((sum, p) => sum + p.amountMinor, 0);
  const band = premiumBandForCredit(creditMinor);
  const preview = !planAccessEnabled();
  return { premium: preview || Boolean(band && people <= band.capacity), preview, validUntil: null, people, creditMinor, capacity: band?.capacity ?? 0, bandId: band?.id ?? null, reviewRequired: purchases.some(p => p.reviewRequired) };
}

export async function requirePremiumAccess(tripId: string, feature: PremiumFeature, db: Database = prisma) {
  if (!(await getTripPlan(tripId, db)).premium) {
    throw new AppError("FORBIDDEN", `${PREMIUM_FEATURES[feature]} requires Premium for this trip's group size. The trip organizer can upgrade for everyone.`, { upgrade: true, feature });
  }
}
export async function requirePremiumTrip(tripId: string, userId: string, feature: PremiumFeature, cap: Capability = "view") {
  const access = await requireTrip(tripId, userId, cap);
  await requirePremiumAccess(tripId, feature);
  return access;
}
export async function getMemberTripPlan(tripId: string, userId: string) { await requireTrip(tripId, userId); return getTripPlan(tripId); }
