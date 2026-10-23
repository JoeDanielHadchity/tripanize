"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { executeAdminCommand, type AdminCommand } from "@/server/admin/operations";
export async function adminAction(input: AdminCommand) {
  return runAction(async () => {
    const user = await requireUser();
    await executeAdminCommand(user.id, input);
    revalidatePath("/company");
    revalidatePath("/", "layout");
  });
}
