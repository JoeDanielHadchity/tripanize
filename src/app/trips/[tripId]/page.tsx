import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { requireTrip } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
export default async function TripIndex({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params; const user = await requireUser(); const access = await requireTrip(tripId, user.id);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { onboardingStage: true } });
  redirect(`/trips/${tripId}/${access.role !== "OWNER" || trip.onboardingStage === "COMPLETE" ? "itinerary" : trip.onboardingStage === "PLAN" ? "premium" : "onboarding"}`);
}
