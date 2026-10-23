import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { requireTrip } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { getTripPlan } from "@/server/plans/access";
import { minorToDecimalString } from "@/lib/money";
import { LinkButton, Notice, PageHeader } from "@/components/ui";
import { TripForm } from "@/components/trip-form";
import { PlanQuestions } from "../plan/questions";
import { OnboardingProgress } from "./progress";
import type { PlanPrefs } from "@/server/planner/questions";
export const metadata: Metadata = { title: "Prepare your trip" };
export default async function OnboardingPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params; const user = await requireUser(); const access = await requireTrip(tripId, user.id);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { destinations: { orderBy: { position: "asc" } }, places: true } });
  const plan = await getTripPlan(tripId);
  if (trip.onboardingStage === "PLAN" || (trip.onboardingPlan === "PREMIUM" && !plan.premium)) redirect(`/trips/${tripId}/premium`);
  if (trip.onboardingStage === "COMPLETE") redirect(`/trips/${tripId}/itinerary`);
  if (access.role !== "OWNER") return <Notice title="The organizer is preparing this trip">You can open the shared itinerary once it is ready. <LinkButton href={`/trips/${tripId}/itinerary`}>Open itinerary</LinkButton></Notice>;
  return <>
    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent-ink">{plan.premium ? "Premium" : "Normal"} · {trip.onboardingStage === "DETAILS" ? "1. Trip details" : trip.onboardingStage === "QUESTIONS" ? "2. Your travel style" : "3. Building your trip"}</p>
    <PageHeader title={trip.onboardingStage === "DETAILS" ? "Tell us about your trip" : trip.onboardingStage === "QUESTIONS" ? "A few choices to make it yours" : "Your trip is coming together"} subtitle={trip.onboardingStage === "DETAILS" ? "Start with destination and dates. Add the details you know; we use these to make your plan realistic." : trip.onboardingStage === "QUESTIONS" ? "Choose an answer to each question. We will then generate and save your itinerary automatically." : "You can leave and return. Your progress is saved."} />
    {trip.onboardingStage === "DETAILS" ? <TripForm mode="edit" onboarding tripId={tripId} initial={{
              version: trip.version, name: trip.name, startDate: trip.startDate, endDate: trip.endDate, timezone: trip.timezone === "UTC" ? "" : trip.timezone, currency: trip.currency,
              budget: trip.budgetMinor !== null ? minorToDecimalString(trip.budgetMinor, trip.currency) : "", pace: trip.pace, interests: trip.interests, transport: trip.transport,
              accessibility: trip.accessibility, preferences: trip.preferences, dietary: trip.dietary, restaurantPrefs: trip.restaurantPrefs, departureCity: trip.departureCity,
              arrivalLocation: trip.arrivalLocation, arrivalAt: trip.arrivalAt, departureLocation: trip.departureLocation, departureAt: trip.departureAt, adults: trip.adults, children: trip.children,
              isRoadTrip: trip.isRoadTrip, carPickupLocation: trip.carPickupLocation, carPickupAt: trip.carPickupAt, carReturnLocation: trip.carReturnLocation, carReturnAt: trip.carReturnAt, notes: trip.notes,
              destinations: trip.destinations.map((d) => ({ id: d.id, name: d.name, country: d.country, arriveDate: d.arriveDate, departDate: d.departDate, accommodationName: d.accommodationName, accommodationAddress: d.accommodationAddress, neighborhood: d.neighborhood, checkInTime: d.checkInTime, checkOutTime: d.checkOutTime, parkingNotes: d.parkingNotes })),
              mustSee: trip.places.filter((p) => p.kind === "MUST_SEE").map((p) => p.name),
              optional: trip.places.filter((p) => p.kind === "OPTIONAL").map((p) => p.name),
            }} /> : trip.onboardingStage === "QUESTIONS" ? <PlanQuestions tripId={tripId} canEdit aiReady={plan.premium} prefs={trip.planPrefs as PlanPrefs | null} onboarding /> : <OnboardingProgress tripId={tripId} />}
  </>;
}
