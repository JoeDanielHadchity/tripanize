import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createBooking, deleteBooking, listBookings, setBookingStatus, updateBooking } from "@/server/bookings/service";
import { addCustomEvent, scheduleEvent, upsertDiscoveredEvents, type EventFields } from "@/server/events/service";
import { getItinerary, restoreVersion, snapshotItinerary } from "@/server/itinerary/service";
import { makeTrip, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
const discovered: EventFields & { sources: { url: string }[] } = {
  title: "Lisbon Jazz Night", category: "concert", date: "2027-05-02", startTime: "19:00", endDate: null, dateVerified: true,
  venue: "Music Hall", city: "Lisbon", address: "Lisbon", officialUrl: "https://example.test/event", bookingUrl: "https://example.test/tickets",
  priceText: "From EUR 30", availability: "Tickets available", bookingDeadline: "Before the show", whyFits: "Live music", uncertainty: null,
  cancelled: false, soldOut: false, sources: [{ url: "https://example.test/event" }],
};
async function setup() {
  const owner = await makeUser("Ana");
  const tripId = await makeTrip(owner.id);
  await upsertDiscoveredEvents(tripId, [discovered]);
  const event = await prisma.tripEvent.findFirstOrThrow({ where: { tripId } });
  const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" } });
  const input = { eventId: event.id, title: event.title, category: "EXPERIENCE" as const, status: "TO_BOOK" as const, date: event.date, startTime: event.startTime, currency: "EUR", bookingUrl: event.bookingUrl };
  return { owner, tripId, event, days, input };
}

describe("event bookings", () => {
  it("shows discoveries as suggestions, tracks once, and waits for confirmation before scheduling", async () => {
    const { owner, tripId, event, input } = await setup();
    await addCustomEvent(owner.id, tripId, { title: "My dinner", city: "Lisbon", bookingUrl: "https://example.test/dinner" });
    expect((await listBookings(owner.id, tripId)).suggestedEvents.map(e => e.id)).toEqual([event.id]);
    const booking = await createBooking(owner.id, tripId, input);
    expect((await createBooking(owner.id, tripId, input)).id).toBe(booking.id);
    expect(await prisma.booking.count({ where: { tripId } })).toBe(1);
    expect(await prisma.stop.count({ where: { tripId } })).toBe(0);
    expect((await listBookings(owner.id, tripId)).suggestedEvents).toHaveLength(0);
    await setBookingStatus(owner.id, tripId, booking.id, "BOOKED", booking.version);
    const itinerary = await getItinerary(owner.id, tripId);
    const stops = itinerary.days.flatMap(d => d.stops);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ bookingId: booking.id, eventId: event.id });
    expect(stops[0].booking?.status).toBe("BOOKED");
  });

  it("links an already scheduled event to its booking and keeps moves and cancellation consistent", async () => {
    const { owner, tripId, event, days, input } = await setup();
    const scheduled = await scheduleEvent(owner.id, tripId, event.id, days[1].id, "19:00", 120);
    const booking = await createBooking(owner.id, tripId, input);
    expect(await prisma.stop.findUnique({ where: { bookingId: booking.id } })).toMatchObject({ id: scheduled.id, eventId: event.id });
    const moved = await updateBooking(owner.id, tripId, booking.id, { ...input, date: days[2].date, title: "My confirmed tickets", status: "PAID" }, booking.version);
    expect(await prisma.stop.count({ where: { tripId } })).toBe(1);
    expect(await prisma.stop.findUnique({ where: { eventId: event.id } })).toMatchObject({ dayId: days[2].id });
    await setBookingStatus(owner.id, tripId, booking.id, "CANCELLED", moved.version);
    expect(await prisma.stop.count({ where: { tripId } })).toBe(0);
    expect(await prisma.tripEvent.findUnique({ where: { id: event.id } })).toMatchObject({ status: "SAVED" });
    await deleteBooking(owner.id, tripId, booking.id);
    expect((await listBookings(owner.id, tripId)).suggestedEvents.map(e => e.id)).toEqual([event.id]);
  });

  it("schedules a tracked suggestion using one entry, then confirms that same entry", async () => {
    const { owner, tripId, event, days, input } = await setup();
    const booking = await createBooking(owner.id, tripId, input);
    const stop = await scheduleEvent(owner.id, tripId, event.id, days[2].id, "20:00", 90);
    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(fresh).toMatchObject({ date: days[2].date, startTime: "20:00", durationMin: 90 });
    await setBookingStatus(owner.id, tripId, booking.id, "BOOKED", fresh.version);
    expect(await prisma.stop.findMany({ where: { tripId } })).toMatchObject([{ id: stop.id, eventId: event.id, bookingId: booking.id }]);
    await expect(scheduleEvent(owner.id, tripId, event.id, days[1].id, "19:00", 120)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps user booking edits during rediscovery and safely restores history from before linking", async () => {
    const { owner, tripId, event, days, input } = await setup();
    await scheduleEvent(owner.id, tripId, event.id, days[1].id, "19:00", 120);
    const snapshot = await prisma.$transaction(tx => snapshotItinerary(tx, tripId, "Before tickets", owner.id));
    const booking = await createBooking(owner.id, tripId, { ...input, title: "Reserved seats", status: "PAID", confirmationRef: "REF-ABC", bookingUrl: "https://example.test/my-ticket" });
    await upsertDiscoveredEvents(tripId, [{ ...discovered, date: days[2].date, bookingUrl: "https://example.test/new-tickets", soldOut: true }]);
    await restoreVersion(owner.id, tripId, snapshot.id);
    expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toMatchObject({ title: "Reserved seats", confirmationRef: "REF-ABC", bookingUrl: "https://example.test/my-ticket", date: days[1].date });
    expect(await prisma.stop.count({ where: { tripId, eventId: event.id, bookingId: booking.id } })).toBe(1);
    expect((await listBookings(owner.id, tripId)).bookings[0].event).toMatchObject({ soldOut: true });
  });

  it("preserves manual entry, rejects unsafe links and prevents cross-trip or viewer links", async () => {
    const { owner, tripId, event, input } = await setup();
    const custom = await addCustomEvent(owner.id, tripId, { title: "My event", bookingUrl: "https://example.test/custom" });
    expect(custom).toMatchObject({ origin: "user", status: "SAVED", bookingUrl: "https://example.test/custom" });
    await expect(addCustomEvent(owner.id, tripId, { title: "Unsafe", bookingUrl: "javascript:alert(1)" })).rejects.toMatchObject({ code: "VALIDATION" });
    const own = await createBooking(owner.id, tripId, { title: "My hotel", category: "ACCOMMODATION", status: "BOOKED", currency: "EUR", date: "2027-05-01" });
    expect(own.eventId).toBeNull();
    expect(await prisma.stop.count({ where: { bookingId: own.id } })).toBe(1);
    const otherTrip = await makeTrip(owner.id);
    await expect(createBooking(owner.id, otherTrip, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const viewer = await makeUser("Viewer");
    await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
    await expect(createBooking(viewer.id, tripId, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.tripEvent.update({ where: { id: event.id }, data: { status: "HIDDEN" } });
    expect((await listBookings(owner.id, tripId)).suggestedEvents).toHaveLength(0);
  });
});
