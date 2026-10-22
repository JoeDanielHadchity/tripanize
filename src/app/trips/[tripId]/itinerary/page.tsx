import { getTripPlan } from "@/server/plans/access";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { roleAllows } from "@/server/auth/permissions";
import { getItinerary, listVersions } from "@/server/itinerary/service";
import { toStopView } from "@/server/itinerary/view";
import { getTripWeather } from "@/server/weather/trip";
import { aiConfigured } from "@/server/ai/openai";
import { routingConfigured } from "@/server/routing";
import { getProfile } from "@/server/profile";
import { LinkButton, PageHeader } from "@/components/ui";
import { TripReadiness } from "@/components/trip-readiness";
import { ItineraryView } from "./view";
import { todayIn, tripLength } from "@/lib/dates";

export const metadata: Metadata = { title: "Itinerary" };

export default async function ItineraryPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const { access, days, ideas } = await getItinerary(user.id, tripId);
  const [trip, versions, { profile }] = await Promise.all([prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { destinations: true, travelers: { where: { leftAt: null } }, bookings: { select: { status: true } } } }), listVersions(user.id, tripId), getProfile(user.id)]);
  let weather: Awaited<ReturnType<typeof getTripWeather>> | null = null;
  try {
    weather = await getTripWeather(tripId);
  } catch {
    weather = null;
  }
  const canEdit = roleAllows(access.role, "edit");
  const { premium } = await getTripPlan(tripId);
  const len = tripLength(trip.startDate, trip.endDate);
  const tripToday = todayIn(trip.timezone);
  const todayDate = todayIn(days.find(d => d.date === tripToday)?.destination?.timezone ?? trip.timezone);
  const base = `/trips/${tripId}`;
  const planned = days.filter(d => d.stops.some(s => s.plan === d.activePlan && s.status !== "SKIPPED")).length;
  const openBookings = trip.bookings.filter(b => ["TO_BOOK", "REQUESTED"].includes(b.status)).length;
  const stays = trip.destinations.filter(d => d.accommodationName || d.accommodationAddress).length;
  const arrivalReady = Boolean(trip.arrivalLocation && trip.arrivalAt && trip.departureLocation && trip.departureAt);
  return (
    <>
      <PageHeader
        title="Your itinerary"
        subtitle={len ? `${len} day${len === 1 ? "" : "s"} · times are local · costs and travel times are estimates` : "Add trip dates in settings to create your days."}
        actions={
          <>
            {canEdit && <LinkButton href={`/trips/${tripId}/plan`} variant="primary">✨ {premium ? "Plan with AI" : "AI itinerary · 3 days"}</LinkButton>}
            <a href={`/api/trips/${tripId}/export/pdf`} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-[15px] font-medium hover:bg-surface-2">Trip PDF</a>
          </>
        }
      />
      <TripReadiness items={[
        { label: "Daily plans", done: days.length > 0 && planned === days.length, detail: `${planned} of ${days.length} days have stops planned`, href: `${base}/itinerary` },
        { label: "Stay details", done: trip.destinations.length > 0 && stays === trip.destinations.length, detail: `${stays} of ${trip.destinations.length} destinations have accommodation details`, href: `${base}/settings#details` },
        { label: "Arrival & departure", done: arrivalReady, detail: arrivalReady ? "Locations and times added" : "Review your arrival and departure locations and times", href: `${base}/settings#details` },
        { label: "Trip budget", done: trip.budgetMinor !== null, detail: trip.budgetMinor !== null ? (premium ? "Budget set · track actual spending in Expenses" : "Budget set in trip details") : (premium ? "Set a budget to track what remains" : "Set a budget in trip details"), href: premium ? `${base}/expenses` : `${base}/settings#details` },
        { label: "Booking follow-ups", done: openBookings === 0 && trip.bookings.some(b => ["BOOKED", "PAID"].includes(b.status)), detail: openBookings ? `${openBookings} reservations still need confirmation` : trip.bookings.length ? "Review reservations and any booking-needed stops" : "Review what needs booking or add your reservations", href: `${base}/bookings` },
        { label: "Travelers", done: trip.travelers.length > 0, detail: `${trip.travelers.length} traveler${trip.travelers.length === 1 ? "" : "s"} listed${premium ? " · review everyone before splitting costs" : ""}`, href: `${base}/settings#travelers` },
      ]} />
      <ItineraryView
        tripId={tripId}
        canEdit={canEdit}
        currency={trip.currency}
        mapsApp={profile.mapsApp}
        premium={premium}
        aiReady={premium && aiConfigured()}
        routingLive={routingConfigured()}
        days={days.map((d) => ({
          id: d.id, date: d.date, title: d.title, area: d.area, notes: d.notes, questions: d.questions, isTravelDay: d.isTravelDay, driveMinutes: d.driveMinutes, activePlan: d.activePlan as "A" | "B", planBNote: d.planBNote, version: d.version, estCostMinor: d.estCostMinor,
          destination: d.destination ? { name: d.destination.name, accommodationName: d.destination.accommodationName, checkInTime: d.destination.checkInTime, checkOutTime: d.destination.checkOutTime, parkingNotes: d.destination.parkingNotes } : null,
          stops: d.stops.map(toStopView),
          weather: weather?.byDate[d.date] ? { kind: weather.byDate[d.date].kind, summary: weather.byDate[d.date].summary, tMax: weather.byDate[d.date].tMax, tMin: weather.byDate[d.date].tMin, precipProb: weather.byDate[d.date].precipProb } : null,
        }))}
        ideas={ideas.map(toStopView)}
        versions={versions.map((v) => ({ id: v.id, reason: v.reason, createdAt: v.createdAt.toISOString() }))}
        timezone={trip.timezone}
        todayDate={todayDate}
        weatherNote={weather?.unavailable.length ? `Weather unavailable for ${weather.unavailable.join(", ")} right now.` : null}
      />
    </>
  );
}
