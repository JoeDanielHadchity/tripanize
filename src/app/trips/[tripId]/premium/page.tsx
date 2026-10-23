import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { billingSummary } from "@/server/billing/service";
import { PremiumCheckout } from "@/components/premium-checkout";
import { LinkButton, Notice, PageHeader } from "@/components/ui";
export const metadata: Metadata = { title: "Trip features & checkout" };
export default async function TripPremiumPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ created?: string }> }) {
  const { tripId } = await params; const user = await requireUser();
  const summary = await billingSummary(user.id, tripId);
  const { created } = await searchParams;
  return <>{created === "1" && <Notice tone="sage" className="mb-5" title="Your trip is created">Start adding your information below. You can come back to your feature selection and checkout at any time.</Notice>}<PageHeader title="Make this trip yours" subtitle="Add your information, choose your features and review your total." actions={<LinkButton href="/plans">Compare plans</LinkButton>} /><PremiumCheckout tripId={tripId} initial={summary} /></>;
}
