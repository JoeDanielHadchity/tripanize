import { prisma } from "@/server/db";
import { geocodeCity } from "@/server/geocode";
import { todayIn } from "@/lib/dates";
import { getWeather, type DayWeather, type WeatherReport } from "./index";

/** Ensures destinations have coordinates and a time zone (best effort; failures leave them empty). */
export async function ensureDestinationCoords(tripId: string) {
  const dests = await prisma.destination.findMany({ where: { tripId }, orderBy: { position: "asc" } });
  for (const d of dests) {
    if (d.lat !== null && d.lng !== null) continue;
    try {
      const g = await geocodeCity(d.country ? `${d.name}` : d.name);
      if (g) await prisma.destination.update({ where: { id: d.id }, data: { lat: g.lat, lng: g.lng, timezone: d.timezone ?? g.timezone, country: d.country ?? g.country } });
    } catch {
      // Geocoding unavailable; weather and maps will show as unavailable.
    }
  }
  return prisma.destination.findMany({ where: { tripId }, orderBy: { position: "asc" } });
}

export type TripWeather = { byDate: Record<string, DayWeather & { destination: string }>; reports: { destination: string; report: WeatherReport }[]; unavailable: string[] };

/** Weather for each trip day, associated with the destination of that day. */
export async function getTripWeather(tripId: string): Promise<TripWeather> {
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  const out: TripWeather = { byDate: {}, reports: [], unavailable: [] };
  if (!trip.startDate || !trip.endDate) return out;
  const dests = await ensureDestinationCoords(tripId);
  const today = todayIn(trip.timezone);
  if (trip.endDate < today) return out;
  for (const d of dests) {
    const from = d.arriveDate ?? trip.startDate;
    const to = d.departDate ?? trip.endDate;
    if (d.lat === null || d.lng === null) {
      out.unavailable.push(d.name);
      continue;
    }
    const start = from < today ? today : from;
    if (start > to) continue;
    const report = await getWeather(d.lat, d.lng, start, to, today);
    out.reports.push({ destination: d.name, report });
    if (report.status === "unavailable") out.unavailable.push(d.name);
    for (const w of report.days) out.byDate[w.date] = { ...w, destination: d.name };
  }
  return out;
}
