import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { billingSummary } from "@/server/billing/service";
import { PremiumCheckout } from "@/components/premium-checkout";
import { LinkButton, PageHeader } from "@/components/ui";
export const metadata: Metadata = { title: "Trip Premium" };
export default async function TripPremiumPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params; const user = await requireUser();
  const summary = await billingSummary(user.id, tripId);
  return <><PageHeader title="Premium for this trip" subtitle="One trip. One payment. Everyone included." actions={<LinkButton href="/plans">Compare plans</LinkButton>} /><PremiumCheckout tripId={tripId} initial={summary} /></>;
}
