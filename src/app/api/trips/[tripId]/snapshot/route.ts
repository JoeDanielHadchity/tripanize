import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";
import { noStore, withUser } from "@/server/api";
import { effectiveStop, stopInclude } from "@/server/itinerary/service";

/** Read-only essentials for offline use: itinerary days and booking essentials (no confirmation numbers). */
export async function GET(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return withUser(async (userId) => {
    await requireTrip(tripId, userId, "view");
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { id: true, name: true, startDate: true, endDate: true, timezone: true, currency: true } });
    const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" }, include: { destination: { select: { name: true, accommodationName: true, accommodationAddress: true } }, stops: { include: stopInclude, orderBy: { position: "asc" } } } });
    const bookings = await prisma.booking.findMany({ where: { tripId, status: { not: "CANCELLED" } }, select: { id: true, title: true, category: true, date: true, startTime: true, status: true, address: true, bookingUrl: true }, orderBy: [{ date: "asc" }, { startTime: "asc" }] });
    return NextResponse.json(
      {
        syncedAt: new Date().toISOString(),
        trip,
        days: days.map((d) => ({
          date: d.date, title: d.title, area: d.area, destination: d.destination, activePlan: d.activePlan, notes: d.notes,
          stops: d.stops.filter((s) => s.plan === d.activePlan).map((s) => {
            const e = effectiveStop(s);
            return { title: e.title, startTime: e.startTime, durationMin: e.durationMin, address: e.address, locationName: s.locationName, lat: s.lat, lng: s.lng, status: e.status, fixed: s.isFixed, booking: s.booking ? s.booking.status : null, officialUrl: e.officialUrl };
          }),
        })),
        bookings,
      },
      { headers: noStore },
    );
  });
}
