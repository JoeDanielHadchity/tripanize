"use server";

import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { markChangeNotificationsRead, setChangeEmailPreference } from "@/server/notifications/changes";
import { setBookingReminderPreference } from "@/server/bookings/reminders";
import { updateNotificationPrefs } from "@/server/profile";
import { revalidatePath } from "next/cache";

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

/** Trip settings › Alerts: every email choice for one trip, saved together. */
export async function tripAlertsAction(tripId: string, input: { changes: boolean; bookings: boolean; events?: { emailEnabled: boolean; frequency: string; changeTypes: string[] } }) {
  return runAction(async () => {
    const user = await requireUser();
    await setChangeEmailPreference(user.id, tripId, input.changes === true);
    await setBookingReminderPreference(user.id, tripId, input.bookings === true);
    if (input.events) await updateNotificationPrefs(user.id, tripId, { emailEnabled: input.events.emailEnabled === true, frequency: String(input.events.frequency), changeTypes: Array.isArray(input.events.changeTypes) ? input.events.changeTypes.map(String).slice(0, 10) : [] });
    revalidatePath(`/trips/${tripId}`, "layout");
  });
}
