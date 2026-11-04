import { NextResponse } from "next/server";
import { noStore, withUser } from "@/server/api";
import { AppError } from "@/server/errors";
import { beginCreditCheckout, refreshCreditPayments } from "@/server/billing/credits";
import { creditsView } from "@/server/credits/service";
import { CREDIT_BUNDLES } from "@/lib/credits";

/** Account › Credits: start a bundle checkout ({ bundleId, tripId? }) or re-check recent payments ({ refresh: true }). */
export async function POST(request: Request) {
  return withUser(async userId => {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("FORBIDDEN", "Please start checkout from Tripanize.");
    if (Number(request.headers.get("content-length")) > 1024) throw new AppError("VALIDATION", "Invalid purchase request.");
    const data = await request.json() as { bundleId?: unknown; tripId?: unknown; refresh?: unknown };
    if (data.refresh === true) { await refreshCreditPayments(userId); return NextResponse.json(await creditsView(userId), { headers: noStore }); }
    const bundle = CREDIT_BUNDLES.find(b => b.id === data.bundleId);
    if (!bundle) throw new AppError("VALIDATION", "Choose a credit bundle.");
    const tripId = typeof data.tripId === "string" && data.tripId.length <= 64 && data.tripId ? data.tripId : null;
    return NextResponse.json(await beginCreditCheckout(userId, bundle.id, tripId), { headers: noStore });
  });
}
