import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { billingSummary } from "@/server/billing/service";
import { PremiumCheckout } from "@/components/premium-checkout";
import { LinkButton, Notice, PageHeader } from "@/components/ui";
export const metadata: Metadata = { title: "Choose your trip plan" };
export default async function TripPremiumPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ created?: string }> }) {
  const { tripId } = await params; const user = await requireUser();
  const summary = await billingSummary(user.id, tripId);
  const { created } = await searchParams;
  return <>{created === "1" && <Notice tone="sage" className="mb-5" title="Your trip is created">Choose Normal or Premium before entering your destination and travel details.</Notice>}<PageHeader title="Choose how you want to travel" subtitle="Normal is free. Premium is $15 per trip, for your whole group." actions={<LinkButton href="/plans">Compare plans</LinkButton>} /><PremiumCheckout tripId={tripId} initial={summary} /></>;
}
