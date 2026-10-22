import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { roleAllows } from "@/server/auth/permissions";
import { listBookings } from "@/server/bookings/service";
import { EventsBookingsSection } from "@/components/events-bookings-section";
import { BookingsView } from "./view";

export const metadata: Metadata = { title: "Bookings · Events & bookings" };

export default async function BookingsPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ event?: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const { access, bookings, suggestedEvents, premium } = await listBookings(user.id, tripId);
  const { event: eventId } = await searchParams;
  const initialEvent = premium && eventId ? await prisma.tripEvent.findFirst({ where: { id: eventId, tripId, booking: null }, include: { stop: { select: { startTime: true, durationMin: true, day: { select: { date: true } } } } } }) : null;
  const eventView = (e: (typeof suggestedEvents)[number]) => ({
    id: e.id, title: e.title, category: e.category, date: e.date, endDate: e.endDate, startTime: e.startTime, dateVerified: e.dateVerified,
    venue: e.venue, city: e.city, address: e.address, officialUrl: e.officialUrl, bookingUrl: e.bookingUrl, priceText: e.priceText,
    availability: e.availability, bookingDeadline: e.bookingDeadline, cancelled: e.cancelled, soldOut: e.soldOut,
    scheduledDate: e.stop?.day?.date ?? null, scheduledTime: e.stop?.startTime ?? null, durationMin: e.stop?.durationMin ?? null,
  });
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { currency: true, startDate: true, endDate: true } });
  return (
    <EventsBookingsSection tripId={tripId} selected="bookings" premium={premium}>
      <BookingsView
        tripId={tripId}
        canEdit={roleAllows(access.role, "edit")}
        premium={premium}
        currency={trip.currency}
        tripDates={{ start: trip.startDate, end: trip.endDate }}
        suggestedEvents={suggestedEvents.map(eventView)}
        initialEvent={initialEvent ? eventView(initialEvent) : null}
        bookings={bookings.map((b) => ({
          id: b.id, event: b.event, version: b.version, title: b.title, category: b.category, date: b.date, startTime: b.startTime, endDate: b.endDate, durationMin: b.durationMin, guests: b.guests, status: b.status, priority: b.priority,
          whenToBook: b.whenToBook, estCostMinor: b.estCostMinor, finalCostMinor: b.finalCostMinor, currency: b.currency, ticketType: b.ticketType, preferences: b.preferences, address: b.address, bookingUrl: b.bookingUrl,
          confirmationRef: b.confirmationRef, notes: b.notes, cancellationTerms: b.cancellationTerms, attachments: b.attachments, hasExpense: b.expenses.length > 0, inItinerary: Boolean(b.stop?.dayId), updatedAt: b.updatedAt.toISOString(),
        }))}
      />
    </EventsBookingsSection>
  );
}
