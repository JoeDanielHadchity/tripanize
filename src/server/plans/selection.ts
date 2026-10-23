import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";
import { PREMIUM_FEATURE_KEYS, selectedPremiumFeatures } from "@/lib/plans";

const selection = z.array(z.enum(PREMIUM_FEATURE_KEYS)).max(PREMIUM_FEATURE_KEYS.length);

export async function saveTripFeatures(userId: string, tripId: string, input: unknown) {
  await requireTrip(tripId, userId, "manage");
  const features = selectedPremiumFeatures(selection.parse(input));
  // Deliberately separate from plan access: no selection can grant Premium.
  await prisma.trip.update({ where: { id: tripId }, data: { selectedPremiumFeatures: features } });
  return features;
}
