import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { createBooking, updateBooking, setBookingStatus, deleteBooking } from "@/server/bookings/service";
import { queueDueBookingReminders, nextBookingReminderAt, deadlineInstant, bookingReminderStillRelevant, setBookingReminderPreference } from "@/server/bookings/reminders";
import { sendNextChangeEmail } from "@/server/notifications/changes";
import { makeTrip, makeUser, resetDb } from "./helpers";
const now = new Date("2027-04-30T12:00:00Z");
beforeEach(async () => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); await resetDb(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function fixture() {
  const owner = await makeUser("Owner"), viewer = await makeUser("Viewer");
  await prisma.user.updateMany({ data: { emailVerified: true } });
  const tripId = await makeTrip(owner.id, { timezone: "Europe/Paris" });
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  const booking = await createBooking(owner.id, tripId, { title: "Museum tickets", category: "ATTRACTION", status: "TO_BOOK", currency: "EUR", bookByAt: "2027-05-01T14:00" });
  return { owner, viewer, tripId, booking };
}
it("queues both in-app reminder windows exactly once, survives rechecks and observes the trip time zone", async () => {
  const { tripId, booking } = await fixture();
  expect(deadlineInstant(booking.bookByAt!, "Europe/Paris").toISOString()).toBe("2027-05-01T12:00:00.000Z");
  expect(await queueDueBookingReminders(now)).toBe(1);
  expect(await queueDueBookingReminders(now)).toBe(0);
  let notices = await prisma.tripNotification.findMany({ where: { tripId, kind: "booking_reminder" } });
  expect(notices).toHaveLength(2); expect(notices.every(n => n.emailStatus === "disabled" && n.href.includes(booking.id))).toBe(true);
  expect((await nextBookingReminderAt(now))?.toISOString()).toBe("2027-05-01T12:00:00.000Z");
  vi.setSystemTime(new Date("2027-05-01T12:00:00Z"));
  expect(await queueDueBookingReminders()).toBe(1);
  expect(await queueDueBookingReminders()).toBe(0);
  notices = await prisma.tripNotification.findMany({ where: { tripId, kind: "booking_reminder" } }); expect(notices).toHaveLength(4);
  vi.setSystemTime(new Date("2027-05-05T12:00:00Z")); expect(await queueDueBookingReminders()).toBe(0); expect(await nextBookingReminderAt()).toBeNull();
});
it("sends only opted-in email with an immutable idempotency key and cancels it when paid or edited", async () => {
  const { owner, viewer, tripId, booking } = await fixture();
  await prisma.notificationPreference.upsert({ where: { userId_tripId: { tripId, userId: owner.id } }, create: { tripId, userId: owner.id, bookingReminderEmailEnabled: true }, update: { bookingReminderEmailEnabled: true } });
  await queueDueBookingReminders();
  const send = vi.fn(async (_message: { idempotencyKey?: string }) => ({ status: "sent" as const, providerId: "fixture" }));
  await sendNextChangeEmail(send);
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0][0].idempotencyKey).toMatch(/^trip-change\//);
  expect((await prisma.tripNotification.findFirstOrThrow({ where: { tripId, userId: viewer.id, kind: "booking_reminder" } })).emailStatus).toBe("disabled");
  await setBookingStatus(owner.id, tripId, booking.id, "PAID", booking.version);
  expect(await queueDueBookingReminders()).toBe(0);
  const n = await prisma.tripNotification.findFirstOrThrow({ where: { tripId, kind: "booking_reminder" } }); expect(await bookingReminderStillRelevant(n.auditId)).toBe(false);
  const b = await createBooking(owner.id, tripId, { title: "Balance", category: "ACCOMMODATION", status: "BOOKED", currency: "EUR", paymentDueAt: "2027-05-01T14:00" });
  await queueDueBookingReminders();
  await setBookingStatus(owner.id, tripId, b.id, "PAID", b.version);
  send.mockClear(); await sendNextChangeEmail(send); expect(send).not.toHaveBeenCalled();
  expect((await prisma.tripNotification.findFirstOrThrow({ where: { tripId, kind: "booking_reminder", audit: { entityId: b.id }, userId: owner.id } })).emailStatus).toBe("cancelled");
});
it("does not send stale, deleted, hidden event or cancelled booking reminders", async () => {
  const { owner, tripId, booking } = await fixture(); await queueDueBookingReminders();
  const n = await prisma.tripNotification.findFirstOrThrow({ where: { tripId, kind: "booking_reminder" } });
  await updateBooking(owner.id, tripId, booking.id, { title: booking.title, category: booking.category, status: booking.status, currency: booking.currency, bookByAt: "2027-05-08T14:00" }, booking.version);
  expect(await bookingReminderStillRelevant(n.auditId)).toBe(false);
  await deleteBooking(owner.id, tripId, booking.id); expect(await bookingReminderStillRelevant(n.auditId)).toBe(false);
  await createBooking(owner.id, tripId, { title: "Cancelled stay", category: "ACCOMMODATION", status: "CANCELLED", currency: "EUR", paymentDueAt: "2027-05-01T14:00", freeCancellationAt: "2027-05-01T14:00" });
  expect(await queueDueBookingReminders()).toBe(0);
});
it("keeps free cancellation reminders for paid bookings and rejects impossible dates and DST gaps", async () => {
  const { owner, tripId, booking } = await fixture(); await deleteBooking(owner.id, tripId, booking.id);
  await createBooking(owner.id, tripId, { title: "Hotel", category: "ACCOMMODATION", status: "PAID", currency: "EUR", freeCancellationAt: "2027-05-01T14:00", paymentDueAt: "2027-05-01T14:00" });
  expect(await queueDueBookingReminders()).toBe(1);
  expect((await prisma.tripNotification.findFirstOrThrow({ where: { tripId, kind: "booking_reminder" } })).summary).toContain("Free cancellation");
  for (const local of ["2027-02-31T14:00", "2027-03-28T02:30", "invalid", "2027-04-30T25:00"]) expect(() => deadlineInstant(local, "Europe/Paris")).toThrow();
});
it("allows members to control their own reminders and enforces membership/verified email", async () => {
  const { owner, viewer, tripId } = await fixture(); const outsider = await makeUser("Outside");
  vi.stubEnv("RESEND_API_KEY", "fixture-not-used"); vi.stubEnv("EMAIL_FROM", "Tripanize <hello@example.test>");
  await setBookingReminderPreference(viewer.id, tripId, true);
  expect((await prisma.notificationPreference.findUniqueOrThrow({ where: { userId_tripId: { userId: viewer.id, tripId } } })).bookingReminderEmailEnabled).toBe(true);
  await expect(setBookingReminderPreference(outsider.id, tripId, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await prisma.user.update({ where: { id: owner.id }, data: { emailVerified: false } });
  await expect(setBookingReminderPreference(owner.id, tripId, true)).rejects.toMatchObject({ code: "VALIDATION" });
  await setBookingReminderPreference(viewer.id, tripId, false);
});
