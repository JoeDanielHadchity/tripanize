import { NextResponse } from "next/server";
import { noStore, withUser } from "@/server/api";
import { topUpTrip, tripWallet } from "@/server/credits/service";
import { requireTrip } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";

/** A trip's own credits: GET shows them, POST { amount } moves credits over from the organizer's balance. */
export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return withUser(async userId => { await requireTrip(tripId, userId); return NextResponse.json(await tripWallet(userId, tripId), { headers: noStore }); });
}
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return withUser(async userId => {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("FORBIDDEN", "Please add credits from Tripanize.");
    if (Number(request.headers.get("content-length")) > 256) throw new AppError("VALIDATION", "Invalid request.");
    const { amount } = await request.json() as { amount?: unknown };
    await requireTrip(tripId, userId);
    await topUpTrip(userId, tripId, Number(amount));
    return NextResponse.json(await tripWallet(userId, tripId), { headers: noStore });
  });
}
