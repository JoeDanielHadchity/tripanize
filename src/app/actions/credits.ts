"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { setMembersUseCredits } from "@/server/credits/service";

export async function setMembersUseCreditsAction(tripId: string, on: boolean) {
  return runAction(async () => {
    await setMembersUseCredits((await requireUser()).id, tripId, on);
    revalidatePath(`/trips/${tripId}`, "layout");
  });
}
