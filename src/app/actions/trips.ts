"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { createTrip, deleteTrip, previewTripChange, updateTrip } from "@/server/trips/service";
import type { TripInput } from "@/server/trips/schemas";
import { ensureDestinationCoords } from "@/server/weather/trip";
import { prisma } from "@/server/db";
import { addTask, deleteTask, toggleTask } from "@/server/trips/tasks";
import { copyExample } from "@/server/examples/copy";

/** Best effort: fill the trip time zone from the first destination when the traveler left it blank. */
async function detectTimezone(tripId: string) {
  const dests = await Promise.race([ensureDestinationCoords(tripId), new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  const tz = dests?.find((d) => d.timezone)?.timezone;
  if (trip && trip.timezone === "UTC" && tz) await prisma.trip.update({ where: { id: tripId }, data: { timezone: tz } });
}

export async function createTripAction(input: TripInput) {
  return runAction(async () => {
    const user = await requireUser();
    const id = await createTrip(user.id, input);
    await detectTimezone(id).catch(() => undefined);
    revalidatePath("/trips");
    return { id };
  });
}

export async function updateTripAction(tripId: string, input: TripInput, version: number) {
  return runAction(async () => {
    const user = await requireUser();
    await updateTrip(user.id, tripId, input, version);
    await detectTimezone(tripId).catch(() => undefined);
    revalidatePath(`/trips/${tripId}`, "layout");
  });
}

export async function previewTripChangeAction(tripId: string, input: TripInput) {
  return runAction(async () => {
    const user = await requireUser();
    return previewTripChange(user.id, tripId, input);
  });
}

export async function deleteTripAction(tripId: string, confirmName: string) {
  return runAction(async () => {
    const user = await requireUser();
    await deleteTrip(user.id, tripId, confirmName);
    revalidatePath("/trips");
  });
}

export async function copyExampleAction(slug: string, startDate: string) {
  return runAction(async () => {
    const user = await requireUser();
    const id = await copyExample(user.id, slug, startDate);
    revalidatePath("/trips");
    return { id };
  });
}

export async function addTaskAction(tripId: string, input: { title: string; dueDate?: string | null; assigneeId?: string | null }) {
  return runAction(async () => {
    const user = await requireUser();
    await addTask(user.id, tripId, input);
    revalidatePath(`/trips/${tripId}`, "layout");
  });
}

export async function toggleTaskAction(tripId: string, taskId: string, done: boolean, version: number) {
  return runAction(async () => {
    const user = await requireUser();
    await toggleTask(user.id, tripId, taskId, done, version);
    revalidatePath(`/trips/${tripId}`, "layout");
  });
}

export async function deleteTaskAction(tripId: string, taskId: string) {
  return runAction(async () => {
    const user = await requireUser();
    await deleteTask(user.id, tripId, taskId);
    revalidatePath(`/trips/${tripId}`, "layout");
  });
}
