import { prisma, type Tx } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { requireTrip, type Capability } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { PREMIUM_FEATURES, PREMIUM_BANDS, type PremiumFeature } from "@/lib/plans";
import { billingEnvironment } from "@/server/billing/config";
import { isCompanyAccount } from "@/server/admin/identity";

type Database = Pick<Tx, "trip" | "premiumCheckout" | "trialInvitation">;
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
  const hasPurchase = purchases.some(p => !p.reviewRequired && [900, 1500, 2500].includes(p.amountMinor));
  const band = hasPurchase ? PREMIUM_BANDS[0] : null;
  const preview = !planAccessEnabled();
  const trip = await db.trip.findUniqueOrThrow({ where: { id: tripId }, select: { ownerId: true, owner: { select: { email: true, emailVerified: true } }, memberships: { select: { user: { select: { email: true, emailVerified: true } } } } } });
  const company = isCompanyAccount(trip.owner) || trip.memberships.some(m => isCompanyAccount(m.user));
  const trial = await db.trialInvitation.findUnique({ where: { tripId }, select: { acceptedAt: true, acceptedById: true, revokedAt: true, trialEndsAt: true } });
  const hasTrial = Boolean(trial?.acceptedAt && !trial.revokedAt && trial.acceptedById === trip.ownerId && (!trial.trialEndsAt || trial.trialEndsAt > new Date()));
  const source = hasPurchase ? "purchase" : company ? "company" : hasTrial ? "trial" : null;
  return { premium: preview || Boolean(source), preview, source, validUntil: source === "trial" ? trial?.trialEndsAt?.toISOString() ?? null : null, people, creditMinor, capacity: band?.capacity ?? 0, bandId: band?.id ?? null, reviewRequired: purchases.some(p => p.reviewRequired) };
}

export async function requirePremiumAccess(tripId: string, feature: PremiumFeature, db: Database = prisma) {
  if (!(await getTripPlan(tripId, db)).premium) {
    throw new AppError("FORBIDDEN", `${PREMIUM_FEATURES[feature]} requires Premium for this trip. The trip organizer can upgrade for everyone.`, { upgrade: true, feature });
  }
}
export async function requirePremiumTrip(tripId: string, userId: string, feature: PremiumFeature, cap: Capability = "view") {
  const access = await requireTrip(tripId, userId, cap);
  await requirePremiumAccess(tripId, feature);
  return access;
}
export async function getMemberTripPlan(tripId: string, userId: string) { await requireTrip(tripId, userId); return getTripPlan(tripId); }
