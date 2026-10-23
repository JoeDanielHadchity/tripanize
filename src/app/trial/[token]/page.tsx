import { OPERATOR_NAME } from "@/lib/legal";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { previewTrialInvitation, pendingTrialInvitations, trialTripChoices, redeemedTrialTrip } from "@/server/admin/trials";
import { Logo } from "@/components/shell";
import { Badge, Card, LinkButton, Notice } from "@/components/ui";
import { TrialClaim } from "@/components/trial-claim";
export const metadata: Metadata = { title: "Your Premium trial invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function TrialInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await previewTrialInvitation(token);
  const user = await getSessionUser();
  if (user) { const tripId = await redeemedTrialTrip(user.id, token); if (tripId) redirect(`/trips/${tripId}`); }
  const eligible = user && inv ? (await pendingTrialInvitations(user.id)).some(i => i.id === inv.id) : false;
  const trips = user && eligible ? await trialTripChoices(user.id) : [];
  const next = encodeURIComponent(`/trial/${token}`);
  return <main id="main" className="mx-auto max-w-lg px-4 py-10"><Link href="/"><Logo /></Link><Card className="mt-10">
    {!inv ? <Notice tone="warn" title="Invitation unavailable">This invitation has expired, was revoked or has already been used. If you accepted it, sign in with the invited email to reopen your saved trip.{!user && <LinkButton href={`/sign-in?next=${next}`} className="mt-3">Sign in to my trial trip</LinkButton>}</Notice> : <>
      <Badge tone="accent">One-trip Premium trial</Badge><h1 className="mt-4 font-display text-3xl font-semibold">Your next trip, with everything included</h1><p className="mt-3 text-sm leading-6 text-muted">{OPERATOR_NAME} invited {inv.maskedEmail} to try every Premium feature for one trip. No card, subscription or automatic charge. {inv.durationDays ? `Trial access lasts ${inv.durationDays} days after activation.` : "Trial access lasts until revoked."}</p>
      {!user ? <div className="mt-5 flex flex-wrap gap-3"><LinkButton href={`/sign-in?next=${next}`} variant="primary">Sign in with an email code</LinkButton><LinkButton href={`/sign-up?next=${next}`}>Create an account</LinkButton></div> : eligible ? <TrialClaim invitationId={inv.id} trips={trips} durationDays={inv.durationDays} /> : <Notice className="mt-4" tone="warn">Sign in with the invited email and verify it using an email sign-in code. You’re currently signed in as {user.email}. <Link href={`/sign-in?reauth=1&next=${next}`} className="underline">Use the invited email</Link></Notice>}
    </>}
  </Card><LinkButton href="/trips" className="mt-5">My trips</LinkButton></main>;
}
