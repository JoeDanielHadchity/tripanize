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
import { ItineraryView } from "./view";
import { tripLength } from "@/lib/dates";

export const metadata: Metadata = { title: "Itinerary" };

export default async function ItineraryPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const { access, days, ideas } = await getItinerary(user.id, tripId);
  const [trip, versions, { profile }] = await Promise.all([prisma.trip.findUniqueOrThrow({ where: { id: tripId } }), listVersions(user.id, tripId), getProfile(user.id)]);
  let weather: Awaited<ReturnType<typeof getTripWeather>> | null = null;
  try {
    weather = await getTripWeather(tripId);
  } catch {
    weather = null;
  }
  const canEdit = roleAllows(access.role, "edit");
  const len = tripLength(trip.startDate, trip.endDate);
  return (
    <>
      <PageHeader
        title="Your itinerary"
        subtitle={len ? `${len} day${len === 1 ? "" : "s"} · times are local · costs and travel times are estimates` : "Add trip dates in settings to create your days."}
        actions={
          <>
            {canEdit && <LinkButton href={`/trips/${tripId}/plan`} variant="primary">✨ Plan with AI</LinkButton>}
            <a href={`/api/trips/${tripId}/export/pdf`} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-[15px] font-medium hover:bg-surface-2">Trip PDF</a>
          </>
        }
      />
      <ItineraryView
        tripId={tripId}
        canEdit={canEdit}
        currency={trip.currency}
        mapsApp={profile.mapsApp}
        aiReady={aiConfigured()}
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
        weatherNote={weather?.unavailable.length ? `Weather unavailable for ${weather.unavailable.join(", ")} right now.` : null}
      />
    </>
  );
}
