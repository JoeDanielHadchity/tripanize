import { prisma, type Tx } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { requireTrip, type Capability } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { PREMIUM_FEATURES, type PremiumFeature } from "@/lib/plans";

type Database = Pick<Tx, "trip" | "premiumEntitlement">;

/** Staged rollout: keep the existing app available until paid checkout is ready. */
export function planAccessEnabled() {
  return currentRuntime().planAccessEnabled === true;
}

export async function getAccountPlan(userId: string, db: Database = prisma) {
  if (!planAccessEnabled()) return { premium: true, preview: true, validUntil: null };
  const entitlement = await db.premiumEntitlement.findUnique({ where: { userId } });
  const paid = Boolean(entitlement && !entitlement.revokedAt && entitlement.validUntil.getTime() > Date.now());
  return { premium: paid, preview: false, validUntil: paid ? entitlement!.validUntil.toISOString() : null };
}

/** The trip owner's subscription covers the group. Trip roles still apply. */
export async function getTripPlan(tripId: string, db: Database = prisma) {
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { ownerId: true } });
  if (!trip) throw new AppError("NOT_FOUND", "Trip not found.");
  return getAccountPlan(trip.ownerId, db);
}

export async function requirePremiumAccess(tripId: string, feature: PremiumFeature, db: Database = prisma) {
  if (!(await getTripPlan(tripId, db)).premium) {
    throw new AppError("FORBIDDEN", `${PREMIUM_FEATURES[feature]} requires Premium. The trip organizer can upgrade to unlock it for everyone.`, { upgrade: true, feature });
  }
}

export async function requirePremiumTrip(tripId: string, userId: string, feature: PremiumFeature, cap: Capability = "view") {
  const access = await requireTrip(tripId, userId, cap);
  await requirePremiumAccess(tripId, feature);
  return access;
}

export async function getMemberTripPlan(tripId: string, userId: string) {
  await requireTrip(tripId, userId);
  return getTripPlan(tripId);
}
