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
import { planPrice } from "@/lib/credits";
import { planningScope } from "@/server/plans/planning";
import type { PlanPrefs } from "@/server/planner/questions";
export const metadata: Metadata = { title: "Prepare your trip" };
export default async function OnboardingPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ step?: string }> }) {
  const { tripId } = await params; const { step } = await searchParams; const user = await requireUser(); const access = await requireTrip(tripId, user.id);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { destinations: { orderBy: { position: "asc" } }, places: true } });
  const plan = await getTripPlan(tripId);
  if (trip.onboardingStage === "PLAN" || (trip.onboardingPlan === "PREMIUM" && !plan.premium)) redirect(`/trips/${tripId}/premium`);
  if (trip.onboardingStage === "COMPLETE") redirect(`/trips/${tripId}/itinerary`);
  if (access.role !== "OWNER") return <Notice title="The organizer is preparing this trip">You can open the shared itinerary once it is ready. <LinkButton href={`/trips/${tripId}/itinerary`}>Open itinerary</LinkButton></Notice>;
  // On the questions step, "Edit trip details" reopens step 1 without losing the answers step.
  const details = trip.onboardingStage === "DETAILS" || (trip.onboardingStage === "QUESTIONS" && step === "details");
  return <>
    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent-ink">{details ? "Step 1 of 3 · Where and when" : trip.onboardingStage === "QUESTIONS" ? "Step 2 of 3 · Your travel style" : "Step 3 of 3 · Planning your first days"}{plan.premium ? " · Premium" : ""}</p>
    <PageHeader title={details ? "Trip details" : trip.onboardingStage === "QUESTIONS" ? "Travel preferences" : "Preparing your trip"} actions={!details && trip.onboardingStage === "QUESTIONS" ? <LinkButton href={`/trips/${tripId}/onboarding?step=details`}>Edit trip details</LinkButton> : undefined} />
    {details ? <TripForm mode="edit" onboarding tripId={tripId} initial={{
              version: trip.version, name: trip.name, startDate: trip.startDate, endDate: trip.endDate, timezone: trip.timezone === "UTC" ? "" : trip.timezone, currency: trip.currency,
              budget: trip.budgetMinor !== null ? minorToDecimalString(trip.budgetMinor, trip.currency) : "", pace: trip.pace, interests: trip.interests, transport: trip.transport,
              accessibility: trip.accessibility, preferences: trip.preferences, dietary: trip.dietary, restaurantPrefs: trip.restaurantPrefs, departureCity: trip.departureCity,
              arrivalLocation: trip.arrivalLocation, arrivalAt: trip.arrivalAt, departureLocation: trip.departureLocation, departureAt: trip.departureAt, adults: trip.adults, children: trip.children,
              isRoadTrip: trip.isRoadTrip, carPickupLocation: trip.carPickupLocation, carPickupAt: trip.carPickupAt, carReturnLocation: trip.carReturnLocation, carReturnAt: trip.carReturnAt, notes: trip.notes,
              destinations: trip.destinations.map((d) => ({ id: d.id, name: d.name, country: d.country, arriveDate: d.arriveDate, departDate: d.departDate, accommodationName: d.accommodationName, accommodationAddress: d.accommodationAddress, neighborhood: d.neighborhood, checkInTime: d.checkInTime, checkOutTime: d.checkOutTime, parkingNotes: d.parkingNotes })),
              mustSee: trip.places.filter((p) => p.kind === "MUST_SEE").map((p) => p.name),
              optional: trip.places.filter((p) => p.kind === "OPTIONAL").map((p) => p.name),
            }} /> : trip.onboardingStage === "QUESTIONS" ? <PlanQuestions tripId={tripId} canEdit aiReady={plan.premium} prefs={trip.planPrefs as PlanPrefs | null} onboarding startCredits={planPrice((await planningScope(tripId, "full").catch(() => []))?.length ?? await prisma.itineraryDay.count({ where: { tripId } }), { setup: true, premium: plan.premium })} /> : <OnboardingProgress tripId={tripId} />}
  </>;
}
