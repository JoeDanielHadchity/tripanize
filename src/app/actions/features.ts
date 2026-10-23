"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { saveTripFeatures } from "@/server/plans/selection";
import { billingSummary } from "@/server/billing/service";
import type { PremiumFeature } from "@/lib/plans";

export async function saveTripFeaturesAction(tripId: string, features: PremiumFeature[]) {
  return runAction(async () => {
    const user = await requireUser();
    await saveTripFeatures(user.id, tripId, features);
    revalidatePath(`/trips/${tripId}`, "layout");
    return billingSummary(user.id, tripId);
  });
}
