"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { createTrialInvitation, revokeTrialInvitation, acceptTrialInvitation } from "@/server/admin/trials";
export async function createTrialAction(email: string, durationDays: number | null = 14) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await createTrialInvitation(user.id, email, durationDays);
    revalidatePath("/company");
    return result;
  });
}
export async function revokeTrialAction(id: string) {
  return runAction(async () => {
    const user = await requireUser();
    await revokeTrialInvitation(user.id, id);
    revalidatePath("/company");
    revalidatePath("/trips", "layout");
  });
}
export async function acceptTrialAction(input: { invitationId: string; tripId?: string; name?: string }) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await acceptTrialInvitation(user.id, input);
    revalidatePath("/trips", "layout");
    return result;
  });
}
