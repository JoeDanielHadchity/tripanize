import { NextResponse } from "next/server";
import { noStore, withUser } from "@/server/api";
import { creditsView } from "@/server/credits/service";
import { requireTrip } from "@/server/auth/permissions";

/** The signed-in person's credits, or on a trip the balance that pays for their AI there. */
export async function GET(request: Request) {
  return withUser(async userId => {
    const tripId = new URL(request.url).searchParams.get("tripId");
    if (tripId) await requireTrip(tripId, userId, "view");
    return NextResponse.json(await creditsView(userId, tripId), { headers: noStore });
  });
}
