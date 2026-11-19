import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { getTripPlan } from "@/server/plans/access";
import { balance, creditsActiveFor } from "@/server/credits/service";
import { PREMIUM_CREDIT_PRICE } from "@/lib/credits";

/**
 * Premium for a trip paid with the organizer's account credits instead of money: the same Premium
 * as a purchase, for PREMIUM_CREDIT_PRICE credits. One per trip (unique trip id), and the balance is
 * checked inside the same transaction that spends it, so two taps can't overspend.
 */
export async function unlockPremiumWithCredits(userId: string, tripId: string) {
  const access = await requireTrip(tripId, userId);
  if (access.role !== "OWNER") throw new AppError("FORBIDDEN", "Only the trip organizer can unlock Premium for this trip.");
  const plan = await getTripPlan(tripId);
  if (plan.premium && !plan.preview) throw new AppError("CONFLICT", "This trip already has Premium.");
  if (!await creditsActiveFor(userId)) throw new AppError("FORBIDDEN", "Credits aren't available on your account yet.");
  await prisma.$transaction(async db => {
    const available = await balance(userId, db);
    if (available < PREMIUM_CREDIT_PRICE) throw new AppError("VALIDATION", `Unlocking Premium uses ${PREMIUM_CREDIT_PRICE} credits. You have ${Math.max(0, available)}. Top up or buy a bundle to continue.`, { credits: true, needed: PREMIUM_CREDIT_PRICE, balance: Math.max(0, available) });
    if (await db.premiumUnlock.findUnique({ where: { tripId }, select: { id: true } })) throw new AppError("CONFLICT", "This trip already has Premium.");
    await db.premiumUnlock.create({ data: { tripId, userId, credits: PREMIUM_CREDIT_PRICE } });
    await db.creditEntry.create({ data: { userId, amount: -PREMIUM_CREDIT_PRICE, kind: "spend", note: "premium", tripId, createdById: userId, dedupeKey: `premium-unlock:${tripId}` } });
    // Same next step as a paid upgrade: straight on to the trip details.
    await db.trip.updateMany({ where: { id: tripId, onboardingStage: "PLAN" }, data: { onboardingStage: "DETAILS", onboardingPlan: "PREMIUM" } });
  });
  return getTripPlan(tripId);
}
