import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/server/auth/session";
import { previewInvitation } from "@/server/invitations/service";
import { Logo } from "@/components/shell";
import { LinkButton, Notice } from "@/components/ui";
import { AcceptInvite } from "./accept";

export const metadata: Metadata = { title: "Trip invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [user, inv] = await Promise.all([getSessionUser(), previewInvitation(token)]);
  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-10">
      <Link href="/"><Logo /></Link>
      <div className="mt-10">
        {!inv.ok ? (
          <Notice tone="danger" title="Invitation unavailable">{inv.reason}</Notice>
        ) : (
          <div className="space-y-5">
            <h1 className="font-display text-3xl font-semibold leading-tight">Join “{inv.tripName}”</h1>
            <p className="text-muted">{inv.inviterName} invited you as a <strong>{inv.role === "VIEWER" ? "viewer (read-only)" : "collaborator (can edit the shared plan)"}</strong>{inv.travelerName ? `, as ${inv.travelerName}` : ""}.</p>
            {inv.email && <p className="text-sm text-muted">This invitation is for the account with the email {inv.email.replace(/^(.{2}).*(@.*)$/, "$1•••$2")}.</p>}
            {user ? (
              <AcceptInvite token={token} userEmail={user.email} />
            ) : (
              <div className="flex flex-wrap gap-2">
                <LinkButton href={`/sign-up?next=${next}`} variant="primary">Create an account to join</LinkButton>
                <LinkButton href={`/sign-in?next=${next}`}>I have an account</LinkButton>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
