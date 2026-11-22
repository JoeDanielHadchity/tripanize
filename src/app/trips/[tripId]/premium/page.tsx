import type { Metadata } from "next";
import { creditsActiveFor } from "@/server/credits/service";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { billingSummary } from "@/server/billing/service";
import { PremiumCheckout } from "@/components/premium-checkout";
import { Card, Notice } from "@/components/ui";
import { userTrialAccess } from "@/server/admin/trials";
import { tripWallet } from "@/server/credits/service";
import { TripCredits } from "@/components/trip-credits";
import { CreditTopUp } from "@/components/credit-top-up";
import { creditCheckoutAvailable } from "@/server/billing/config";
import { CREDIT_BUNDLES } from "@/lib/credits";
import { prisma } from "@/server/db";
export const metadata: Metadata = { title: "Choose your trip plan" };
export default async function TripPremiumPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ created?: string; credits?: string; plan?: string }> }) {
  const { tripId } = await params; const user = await requireUser();
  const summary = await billingSummary(user.id, tripId);
  const trial = await userTrialAccess(user.id);
  const wallet = await tripWallet(user.id, tripId);
  const { created, credits, plan: chosen } = await searchParams;
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { name: true, ownerId: true } });
  // Bundles that include Premium for this trip (the $15 one matches the Premium pass, so it isn't repeated).
  const bundles = !summary.premium && trip.ownerId === user.id && summary.credits.active ? CREDIT_BUNDLES.filter(b => b.unlocksPremium && b.priceCents > 1500) : null;
  return <>{credits === "short" && <Notice tone="warn" className="mb-5" title="Not enough credits to unlock Premium">Your trip is created. Unlocking Premium with credits needs {summary.credits.price}, and you have {summary.credits.balance}. Pay for Premium below, get a bundle, or continue free.</Notice>}{created === "1" && credits !== "short" && <Notice tone="sage" className="mb-5" title="Your trip is created">{trial.status === "available" ? "Your Premium trial invitation can unlock this trip now, with no payment." : chosen === "premium" ? "Complete Premium for this trip below: the $15 Premium pass or a credit bundle that includes Premium. You can also continue free." : "Choose how to plan it: Free, Premium for this trip, a credit bundle that includes Premium, or Premium from credits you already have. You can upgrade later too."}</Notice>}<div className="premium-pass-navigation"><Link href={`/trips/${tripId}`}>← Back to trip</Link><Link href="/plans">Plans &amp; pricing</Link></div><PremiumCheckout tripId={tripId} initial={summary} creditsNote={await creditsActiveFor(user.id) ? "Includes 100 AI credits, plenty to plan your whole trip. Top up anytime." : undefined} trial={trial} />{bundles && <section aria-labelledby="bundles-h" className="mt-6"><Card><h2 id="bundles-h" className="font-display text-xl font-semibold">Or get Premium with a credit bundle</h2><p className="mt-1 mb-4 text-sm text-muted">Each bundle unlocks Premium for this trip and adds credits to your balance for AI planning on any trip. Credits never expire.</p><CreditTopUp bundles={bundles} trips={[{ id: tripId, name: trip.name }]} available={creditCheckoutAvailable()} forTrip /></Card></section>}{(summary.premium || wallet.exists) && <div className="mt-6"><TripCredits tripId={tripId} initial={wallet} /></div>}</>;
}
