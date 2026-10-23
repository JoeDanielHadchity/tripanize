import { OPERATOR_NAME } from "@/lib/legal";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { pendingTrialInvitations, trialTripChoices } from "@/server/admin/trials";
import { AppHeader } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { TrialClaim } from "@/components/trial-claim";
export const metadata: Metadata = { title: "Activate your one-trip trial", robots: { index: false, follow: false } };
export default async function TrialPage({ searchParams }: { searchParams: Promise<{ invitation?: string }> }) {
  const user = await requireUser();
  const { invitation } = await searchParams;
  const pending = await pendingTrialInvitations(user.id);
  if (!invitation || !pending.some(i => i.id === invitation)) notFound();
  const trips = await trialTripChoices(user.id);
  return <><AppHeader user={user} /><main id="main" className="mx-auto max-w-lg px-4 pb-16 pt-8"><PageHeader title="Try Premium for one trip" subtitle={`An invitation from ${OPERATOR_NAME}. No card, subscription or automatic charge.`} /><Card><TrialClaim invitationId={invitation} trips={trips} /></Card></main></>;
}
