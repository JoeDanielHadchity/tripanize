"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { setNewsEmails } from "@/server/admin/broadcasts";

export async function newsEmailsAction(enabled: boolean) {
  return runAction(async () => {
    const user = await requireUser();
    await setNewsEmails(user.id, z.boolean().parse(enabled));
    revalidatePath("/account");
  });
}
