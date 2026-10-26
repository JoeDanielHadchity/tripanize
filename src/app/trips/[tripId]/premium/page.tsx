import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { billingSummary } from "@/server/billing/service";
import { PremiumCheckout } from "@/components/premium-checkout";
import { LinkButton, Notice, PageHeader } from "@/components/ui";
import { userTrialAccess } from "@/server/admin/trials";
export const metadata: Metadata = { title: "Choose your trip plan" };
export default async function TripPremiumPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ created?: string }> }) {
  const { tripId } = await params; const user = await requireUser();
  const summary = await billingSummary(user.id, tripId);
  const trial = await userTrialAccess(user.id);
  const { created } = await searchParams;
  return <>{created === "1" && <Notice tone="sage" className="mb-5" title="Your trip is created">{trial.status === "available" ? "Your Premium trial invitation can unlock this trip now, with no payment." : "Choose Normal or Premium before entering your destination and travel details."}</Notice>}<PageHeader title="Choose your plan" actions={<LinkButton href="/plans">Compare plans</LinkButton>} /><PremiumCheckout tripId={tripId} initial={summary} trial={trial} /></>;
}
