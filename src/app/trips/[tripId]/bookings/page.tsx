import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { roleAllows } from "@/server/auth/permissions";
import { listBookings } from "@/server/bookings/service";
import { PageHeader } from "@/components/ui";
import { BookingsView } from "./view";

export const metadata: Metadata = { title: "Bookings" };

export default async function BookingsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const { access, bookings } = await listBookings(user.id, tripId);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { currency: true, startDate: true, endDate: true } });
  return (
    <>
      <PageHeader title="Booking tracker" subtitle="One shared record per reservation — it's the same booking you see in the itinerary and Today." />
      <BookingsView
        tripId={tripId}
        canEdit={roleAllows(access.role, "edit")}
        currency={trip.currency}
        tripDates={{ start: trip.startDate, end: trip.endDate }}
        bookings={bookings.map((b) => ({
          id: b.id, version: b.version, title: b.title, category: b.category, date: b.date, startTime: b.startTime, endDate: b.endDate, durationMin: b.durationMin, guests: b.guests, status: b.status, priority: b.priority,
          whenToBook: b.whenToBook, estCostMinor: b.estCostMinor, finalCostMinor: b.finalCostMinor, currency: b.currency, ticketType: b.ticketType, preferences: b.preferences, address: b.address, bookingUrl: b.bookingUrl,
          confirmationRef: b.confirmationRef, notes: b.notes, cancellationTerms: b.cancellationTerms, attachments: b.attachments, hasExpense: b.expenses.length > 0, inItinerary: Boolean(b.stop?.dayId), updatedAt: b.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}
