"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { AppError, runAction } from "@/server/errors";
import { executeTripIdeaCommand, uploadTripIdeaPhoto, type TripIdeaCommand } from "@/server/admin/trip-ideas";
import { saveSiteTexts } from "@/server/admin/texts";
import { sendBroadcast, type BroadcastInput } from "@/server/admin/broadcasts";

/** Trip ideas change public pages, so refresh the site as well as the dashboard. */
function refresh() { revalidatePath("/company"); revalidatePath("/", "layout"); }

export async function tripIdeaAction(input: TripIdeaCommand) {
  return runAction(async () => {
    const user = await requireUser();
    await executeTripIdeaCommand(user.id, input);
    refresh();
  });
}

export async function tripIdeaPhotoAction(form: FormData) {
  return runAction(async () => {
    const user = await requireUser();
    const file = form.get("photo"), slug = String(form.get("slug") ?? ""), kind = form.get("kind") === "hero" ? "hero" : "card";
    if (!(file instanceof File)) throw new AppError("VALIDATION", "Choose a photo.");
    await uploadTripIdeaPhoto(user.id, slug, kind, file, String(form.get("credit") ?? ""));
    refresh();
  });
}

export async function siteTextsAction(changes: Record<string, string | null>) {
  return runAction(async () => {
    const user = await requireUser();
    await saveSiteTexts(user.id, { changes });
    refresh();
  });
}

export async function broadcastAction(input: BroadcastInput) {
  return runAction(async () => {
    const user = await requireUser();
    const result = await sendBroadcast(user.id, input);
    revalidatePath("/company");
    return result;
  });
}
