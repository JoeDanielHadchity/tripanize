import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { billingSummary } from "@/server/billing/service";
import { PremiumCheckout } from "@/components/premium-checkout";
import { Notice } from "@/components/ui";
import { userTrialAccess } from "@/server/admin/trials";
export const metadata: Metadata = { title: "Choose your trip plan" };
export default async function TripPremiumPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ created?: string }> }) {
  const { tripId } = await params; const user = await requireUser();
  const summary = await billingSummary(user.id, tripId);
  const trial = await userTrialAccess(user.id);
  const { created } = await searchParams;
  return <>{created === "1" && <Notice tone="sage" className="mb-5" title="Your trip is created">{trial.status === "available" ? "Your Premium trial invitation can unlock this trip now, with no payment." : "Choose Standard or Premium before entering your destination and travel details."}</Notice>}<div className="premium-pass-navigation"><Link href={`/trips/${tripId}`}>← Back to trip</Link><Link href="/plans">Plans &amp; pricing</Link></div><PremiumCheckout tripId={tripId} initial={summary} trial={trial} /></>;
}
