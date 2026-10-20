"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { updateProfile } from "@/server/profile";

export async function updateProfileAction(input: Parameters<typeof updateProfile>[1]) {
  return runAction(async () => {
    const u = await requireUser();
    await updateProfile(u.id, input);
    revalidatePath("/", "layout");
  });
}
