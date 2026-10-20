import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { roleAllows } from "@/server/auth/permissions";
import { getItinerary } from "@/server/itinerary/service";
import { toStopView } from "@/server/itinerary/view";
import { getTripWeather } from "@/server/weather/trip";
import { weatherAlerts } from "@/server/weather";
import { aiConfigured } from "@/server/ai/openai";
import { getProfile } from "@/server/profile";
import { EmptyState, LinkButton, Notice } from "@/components/ui";
import { addDays, daysBetween, formatDate, isDateStr, nowTimeIn, todayIn } from "@/lib/dates";
import { TodayView } from "./view";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ date?: string }> }) {
  const { tripId } = await params;
  const { date: previewDate } = await searchParams;
  const user = await requireUser();
  const { access, days } = await getItinerary(user.id, tripId);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  const { profile } = await getProfile(user.id);

  // "Today" uses the time zone of where the travelers are: the destination of today's day if known, else the trip's.
  const tripToday = todayIn(trip.timezone);
  const guessDay = days.find((d) => d.date === tripToday);
  const tz = guessDay?.destination?.timezone ?? trip.timezone;
  const today = todayIn(tz);
  const preview = previewDate && isDateStr(previewDate) && previewDate !== today ? previewDate : null;
  const date = preview ?? today;
  const day = days.find((d) => d.date === date);

  if (!trip.startDate || !trip.endDate) {
    return <EmptyState title="Today needs trip dates" action={<LinkButton href={`/trips/${tripId}/settings#details`} variant="primary">Add dates</LinkButton>}>Once the trip has dates, this page shows only what's happening on the current day.</EmptyState>;
  }
  if (!day) {
    const before = today < trip.startDate;
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold">{formatDate(today, { weekday: "long", day: "numeric", month: "long" })}</h1>
        <EmptyState
          title={before ? `Your trip starts in ${daysBetween(today, trip.startDate)} day${daysBetween(today, trip.startDate) === 1 ? "" : "s"}` : "This trip has ended"}
          action={<><LinkButton href={`/trips/${tripId}/itinerary`} variant="primary">Open the itinerary</LinkButton>{before && <LinkButton href={`/trips/${tripId}/today?date=${trip.startDate}`}>Preview day 1</LinkButton>}</>}
        >
          {before ? "Today's view will show your live schedule once you're travelling. Until then, here's how to get ready." : "Hope it was a good one. Your itinerary, expenses and bookings stay available."}
        </EmptyState>
        {before && <Link href={`/trips/${tripId}/packing`} className="block text-center text-sm text-accent-ink underline">Check your packing list</Link>}
      </div>
    );
  }

  let weather = null;
  let weatherStatus: "ok" | "unavailable" | "none" = "none";
  try {
    const w = await getTripWeather(tripId);
    weather = w.byDate[date] ?? null;
    weatherStatus = weather ? "ok" : w.unavailable.length ? "unavailable" : "none";
  } catch {
    weatherStatus = "unavailable";
  }
  const bookings = await prisma.booking.findMany({
    where: { tripId, status: { not: "CANCELLED" }, OR: [{ date }, { category: "ACCOMMODATION", date: { lte: date }, endDate: { gte: date } }] },
    include: { attachments: { select: { id: true, fileName: true } } },
    orderBy: [{ startTime: "asc" }],
  });
  return (
    <>
      {preview && <Notice tone="warn" className="mb-4" title={`Preview of ${formatDate(preview, { weekday: "long", day: "numeric", month: "long" })}`}>This is not today ({formatDate(today)}). <Link href={`/trips/${tripId}/today`} className="underline">Back to today</Link></Notice>}
      <TodayView
        tripId={tripId}
        canEdit={roleAllows(access.role, "edit")}
        currency={trip.currency}
        defaultMapsApp={profile.mapsApp}
        aiReady={aiConfigured()}
        isPreview={Boolean(preview)}
        nowTime={preview ? null : nowTimeIn(tz)}
        timezone={tz}
        date={date}
        tomorrow={days.some((d) => d.date === addDays(date, 1)) ? addDays(date, 1) : null}
        days={days.map((d) => ({ id: d.id, date: d.date, title: d.title }))}
        day={{
          id: day.id, date: day.date, title: day.title, area: day.area, notes: day.notes, questions: day.questions, isTravelDay: day.isTravelDay, driveMinutes: day.driveMinutes, activePlan: day.activePlan as "A" | "B", planBNote: day.planBNote, version: day.version, estCostMinor: day.estCostMinor,
          destination: day.destination ? { name: day.destination.name, accommodationName: day.destination.accommodationName, checkInTime: day.destination.checkInTime, checkOutTime: day.destination.checkOutTime, parkingNotes: day.destination.parkingNotes } : null,
          stops: day.stops.map(toStopView),
          weather: weather ? { kind: weather.kind, summary: weather.summary, tMax: weather.tMax, tMin: weather.tMin, precipProb: weather.precipProb } : null,
        }}
        accommodation={day.destination ? { name: day.destination.accommodationName, address: day.destination.accommodationAddress, checkIn: day.destination.checkInTime, checkOut: day.destination.checkOutTime } : null}
        alerts={weatherAlerts(weather ?? undefined)}
        weatherStatus={weatherStatus}
        bookings={bookings.map((b) => ({ id: b.id, title: b.title, category: b.category, startTime: b.startTime, status: b.status, address: b.address, bookingUrl: b.bookingUrl, date: b.date, endDate: b.endDate, attachments: b.attachments }))}
      />
    </>
  );
}
