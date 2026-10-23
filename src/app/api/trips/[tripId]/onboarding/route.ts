import { NextResponse } from "next/server";
import { noStore, withUser } from "@/server/api";
import { onboardingState } from "@/server/trips/onboarding";
export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return withUser(async userId => NextResponse.json(await onboardingState(userId, tripId), { headers: noStore }));
}
