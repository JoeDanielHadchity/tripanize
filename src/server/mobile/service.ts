import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { accountDisplayName } from "@/server/admin/identity";
import { listTrips, getTripHeader } from "@/server/trips/service";
import { getTripPlan } from "@/server/plans/access";
import { getItinerary } from "@/server/itinerary/service";
import { toStopView, type StopView } from "@/server/itinerary/view";
import { roleAllows } from "@/server/auth/permissions";
import { savedTripImage } from "@/server/images";
import { readMealOptions } from "@/lib/meal-options";
import { todayIn, tripPhase } from "@/lib/dates";
import { discoveryWireResult, normalizeDiscoveryResult } from "@/server/destinations/schema";
import type { MobileItinerary, MobileTripCard, MobileUser, MobileStop, MobileDestinationSearch } from "@/lib/mobile-contracts";

export async function getMobileUser(userId: string): Promise<MobileUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, suspendedAt: true } });
  if (!user || user.suspendedAt) throw new AppError("UNAUTHENTICATED", "Sign in again to continue.");
  return { id: user.id, name: accountDisplayName(user).trim() || user.email.split("@")[0], email: user.email };
}

export async function getMobileTrips(userId: string): Promise<{ trips: MobileTripCard[] }> {
  await getMobileUser(userId);
  const trips = await listTrips(userId);
  return { trips: await Promise.all(trips.map(async trip => ({
    id: trip.id, name: trip.name, role: trip.role, startDate: trip.startDate, endDate: trip.endDate,
    destinations: trip.destinations, travelers: trip.travelers, phase: trip.phase,
    onboardingStage: trip.onboardingStage, premium: (await getTripPlan(trip.id)).premium, image: trip.coverImage,
  }))) };
}

function stopView(stop: StopView): MobileStop {
  return { id: stop.id, title: stop.title, category: stop.category, startTime: stop.startTime, durationMin: stop.durationMin,
    address: stop.address, reason: stop.reason, notes: stop.notes, status: stop.status, estCostMinor: stop.estCostMinor,
    currency: stop.currency, officialUrl: stop.officialUrl, bookingRequired: stop.bookingRequired,
    bookingStatus: stop.booking?.status ?? null, lat: stop.lat, lng: stop.lng };
}

export async function getMobileItinerary(userId: string, tripId: string): Promise<MobileItinerary> {
  await getMobileUser(userId);
  const { access, trip } = await getTripHeader(userId, tripId);
  const { days, ideas } = await getItinerary(userId, tripId);
  const today = todayIn(trip.timezone);
  const plan = await getTripPlan(tripId);
  return {
    trip: { id: trip.id, name: trip.name, role: access.role, startDate: trip.startDate, endDate: trip.endDate,
      destinations: trip.destinations.map(d => d.name), travelers: trip.travelers.map(t => t.name),
      phase: tripPhase(trip.startDate, trip.endDate, today), onboardingStage: trip.onboardingStage,
      premium: plan.premium, image: savedTripImage(trip, trip.destinations[0]) },
    timezone: trip.timezone, today, canEdit: roleAllows(access.role, "edit"),
    days: days.map(day => ({ id: day.id, date: day.date, title: day.title, area: day.area, notes: day.notes,
      destination: day.destination?.name ?? null, activePlan: day.activePlan,
      stops: day.stops.filter(stop => stop.plan === day.activePlan && stop.status !== "SKIPPED").map(toStopView).map(stopView),
      meals: readMealOptions(day.mealOptions) })),
    ideas: ideas.map(toStopView).map(stopView),
  };
}

export async function getMobileDestinations(userId: string): Promise<{ searches: MobileDestinationSearch[] }> {
  await getMobileUser(userId);
  const searches = await prisma.destinationSearch.findMany({ where: { userId, deletedAt: null }, orderBy: { number: "desc" }, take: 50 });
  return { searches: searches.map(search => {
    const parsed = discoveryWireResult.safeParse(search.result);
    const result = parsed.success ? normalizeDiscoveryResult(parsed.data) : null;
    return { id: search.id, number: search.number, status: search.status, selectedTripId: search.selectedTripId,
      ideas: result?.ideas.map(idea => ({ destination: idea.destination, country: idea.country, whyFits: idea.whyFits, bestTime: idea.bestTime, weather: idea.weather })) ?? [] };
  }) };
}
