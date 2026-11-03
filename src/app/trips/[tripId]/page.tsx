import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { requireTrip } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { travelersToday, tripIsLive } from "@/lib/dates";

/** Opening a trip: setup while the owner hasn't finished it, Today while the trip is happening, else the itinerary. */
export default async function TripIndex({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params; const user = await requireUser(); const access = await requireTrip(tripId, user.id);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { onboardingStage: true, startDate: true, endDate: true, timezone: true, destinations: { select: { arriveDate: true, departDate: true, timezone: true } } } });
  const setupDone = access.role !== "OWNER" || trip.onboardingStage === "COMPLETE";
  if (setupDone) redirect(`/trips/${tripId}/${tripIsLive(trip, travelersToday(trip)) ? "today" : "itinerary"}`);
  redirect(`/trips/${tripId}/${trip.onboardingStage === "PLAN" ? "premium" : "onboarding"}`);
}
