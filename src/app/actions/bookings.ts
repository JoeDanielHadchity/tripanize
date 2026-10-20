"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { createBooking, deleteBooking, setBookingStatus, updateBooking, type BookingInput } from "@/server/bookings/service";
import { deleteAttachment, saveAttachment } from "@/server/storage";
import { AppError } from "@/server/errors";

const rv = (tripId: string) => revalidatePath(`/trips/${tripId}`, "layout");

export async function saveBookingAction(tripId: string, bookingId: string | null, input: BookingInput, version: number) {
  return runAction(async () => {
    const u = await requireUser();
    const b = bookingId ? await updateBooking(u.id, tripId, bookingId, input, version) : await createBooking(u.id, tripId, input);
    rv(tripId);
    return { id: b.id };
  });
}

export async function setBookingStatusAction(tripId: string, bookingId: string, status: "IDEA" | "TO_BOOK" | "REQUESTED" | "BOOKED" | "PAID" | "CANCELLED", version: number) {
  return runAction(async () => {
    const u = await requireUser();
    await setBookingStatus(u.id, tripId, bookingId, status, version);
    rv(tripId);
  });
}

export async function deleteBookingAction(tripId: string, bookingId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await deleteBooking(u.id, tripId, bookingId);
    rv(tripId);
  });
}

export async function uploadAttachmentAction(tripId: string, bookingId: string, form: FormData) {
  return runAction(async () => {
    const u = await requireUser();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new AppError("VALIDATION", "Choose a file to upload.");
    await saveAttachment(u.id, tripId, bookingId, file);
    rv(tripId);
  });
}

export async function deleteAttachmentAction(tripId: string, attachmentId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await deleteAttachment(u.id, tripId, attachmentId);
    rv(tripId);
  });
}
