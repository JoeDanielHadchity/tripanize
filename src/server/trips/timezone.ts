import { prisma } from "@/server/db";
import { ensureDestinationCoords } from "@/server/weather/trip";

/** Best effort: fill the trip time zone from the first destination when the traveler left it blank. */
export async function detectTimezone(tripId: string) {
  const dests = await Promise.race([ensureDestinationCoords(tripId), new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  const tz = dests?.find((d) => d.timezone)?.timezone;
  if (trip && trip.timezone === "UTC" && tz) await prisma.trip.update({ where: { id: tripId }, data: { timezone: tz } });
}
