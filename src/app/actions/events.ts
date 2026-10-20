"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { acknowledgeEventChanges, addCustomEvent, previewScheduleEvent, scheduleEvent, setEventStatus, updateDiscoverySettings } from "@/server/events/service";
import { requestDiscovery } from "@/server/events/discovery";
import { updateNotificationPrefs } from "@/server/profile";

const rv = (tripId: string) => revalidatePath(`/trips/${tripId}`, "layout");

export async function setEventStatusAction(tripId: string, eventId: string, status: "SAVED" | "HIDDEN" | "NEW") {
  return runAction(async () => {
    const u = await requireUser();
    await setEventStatus(u.id, tripId, eventId, status);
    rv(tripId);
  });
}

export async function ackEventAction(tripId: string, eventId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await acknowledgeEventChanges(u.id, tripId, eventId);
    rv(tripId);
  });
}

export async function addCustomEventAction(tripId: string, input: { title: string; category?: string; date?: string | null; startTime?: string | null; venue?: string | null; city?: string | null; officialUrl?: string | null; priceText?: string | null; notes?: string | null }) {
  return runAction(async () => {
    const u = await requireUser();
    await addCustomEvent(u.id, tripId, input);
    rv(tripId);
  });
}

export async function previewEventAction(tripId: string, eventId: string, dayId: string, startTime: string | null, durationMin: number) {
  return runAction(async () => {
    const u = await requireUser();
    return previewScheduleEvent(u.id, tripId, eventId, dayId, startTime, durationMin);
  });
}

export async function scheduleEventAction(tripId: string, eventId: string, dayId: string, startTime: string | null, durationMin: number) {
  return runAction(async () => {
    const u = await requireUser();
    await scheduleEvent(u.id, tripId, eventId, dayId, startTime, durationMin);
    rv(tripId);
  });
}

export async function discoverEventsAction(tripId: string) {
  return runAction(async () => {
    const u = await requireUser();
    const r = await requestDiscovery(u.id, tripId);
    rv(tripId);
    return { runId: r.id };
  });
}

export async function discoverySettingsAction(tripId: string, input: { autoDiscovery: boolean; everyHours: number }) {
  return runAction(async () => {
    const u = await requireUser();
    await updateDiscoverySettings(u.id, tripId, input);
    rv(tripId);
  });
}

export async function notificationPrefsAction(tripId: string, input: { emailEnabled: boolean; frequency: string; changeTypes: string[] }) {
  return runAction(async () => {
    const u = await requireUser();
    await updateNotificationPrefs(u.id, tripId, input);
    rv(tripId);
  });
}
