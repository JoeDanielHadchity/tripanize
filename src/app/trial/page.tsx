import { OPERATOR_NAME } from "@/lib/legal";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { pendingTrialInvitations, trialTripChoices, redeemedTrialTrip, userTrialAccess } from "@/server/admin/trials";
import { AppHeader } from "@/components/shell";
import { Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { TrialClaim } from "@/components/trial-claim";
export const metadata: Metadata = { title: "Activate your one-trip trial", robots: { index: false, follow: false } };
export default async function TrialPage({ searchParams }: { searchParams: Promise<{ invitation?: string }> }) {
  const user = await requireUser();
  const { invitation } = await searchParams;
  if ((await userTrialAccess(user.id)).status === "verify") return <><AppHeader user={user} /><main id="main" className="mx-auto max-w-lg px-4 pb-16 pt-8"><PageHeader title="Verify your invited email" /><Notice>Use an email sign-in code to verify the address that received your Premium invitation. No payment details are needed.<LinkButton href={`/sign-in?reauth=1&next=${encodeURIComponent(invitation ? `/trial?invitation=${encodeURIComponent(invitation)}` : "/start")}`} className="mt-3">Verify my email</LinkButton></Notice></main></>;
  if (invitation) { const tripId = await redeemedTrialTrip(user.id, undefined, invitation); if (tripId) redirect(`/trips/${tripId}`); }
  const pending = await pendingTrialInvitations(user.id);
  const offer = pending.find(i => i.id === invitation);
  if (!invitation || !offer) notFound();
  const trips = await trialTripChoices(user.id);
  return <><AppHeader user={user} /><main id="main" className="mx-auto max-w-lg px-4 pb-16 pt-8"><PageHeader title={offer.durationDays ? `Try every Premium feature for ${offer.durationDays} days` : "Try Premium for one trip"} subtitle={`An invitation from ${OPERATOR_NAME}. No card, subscription or automatic charge.`} /><Card><TrialClaim invitationId={invitation} trips={trips} durationDays={offer.durationDays} /></Card></main></>;
}
