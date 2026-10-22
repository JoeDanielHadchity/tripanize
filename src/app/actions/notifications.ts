"use server";

import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { markChangeNotificationsRead, setChangeEmailPreference } from "@/server/notifications/changes";

export async function markNotificationsReadAction(input: { id: string } | { before: string }) {
  return runAction(async () => {
    const user = await requireUser();
    await markChangeNotificationsRead(user.id, input);
  });
}

export async function changeEmailPreferenceAction(tripId: string, enabled: boolean) {
  return runAction(async () => {
    const user = await requireUser();
    await setChangeEmailPreference(user.id, tripId, enabled);
  });
}
