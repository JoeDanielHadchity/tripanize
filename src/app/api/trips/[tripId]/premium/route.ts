import { NextResponse } from "next/server";
import { noStore, withUser } from "@/server/api";
import { beginCheckout, billingSummary, refreshTripPayment } from "@/server/billing/service";
import { AppError } from "@/server/errors";
import { PREMIUM_BANDS } from "@/lib/plans";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return withUser(async userId => NextResponse.json(await billingSummary(userId, tripId), { headers: noStore }));
}
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return withUser(async userId => {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("FORBIDDEN", "Please start checkout from Tripanize.");
    if (Number(request.headers.get("content-length")) > 1024) throw new AppError("VALIDATION", "Invalid purchase request.");
    const data = await request.json() as { bandId?: unknown; refresh?: unknown };
    if (data.refresh === true) return NextResponse.json(await refreshTripPayment(userId, tripId), { headers: noStore });
    const band = PREMIUM_BANDS.find(b => b.id === data.bandId);
    if (!band) throw new AppError("VALIDATION", "Choose a Premium group size.");
    return NextResponse.json(await beginCheckout(userId, tripId, band.id), { headers: noStore });
  });
}
