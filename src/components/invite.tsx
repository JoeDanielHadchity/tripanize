"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Field, Input, Select, cx } from "@/components/ui";
import { Dialog, useAction } from "@/components/client";
import { createInviteAction } from "@/app/actions/members";

type Traveler = { id: string; name: string };

/** The invitation form: role, optional traveler to connect and optional email; shows the one-time link once created. */
export function InviteForm({ tripId, tripName, travelers, compact = false }: { tripId: string; tripName: string; travelers: Traveler[]; compact?: boolean }) {
  const { run, pending } = useAction();
  const [link, setLink] = useState<{ url: string; emailStatus: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  if (link) {
    return (
      <div className="space-y-3 rounded-xl bg-sage-soft p-3 text-sm">
        <p className="font-semibold text-sage-ink">Invitation link (expires in 7 days, single use)</p>
        <div className="flex gap-2">
          <Input readOnly value={link.url} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
          <Button onClick={async () => { await navigator.clipboard.writeText(link.url); setCopied(true); }}>{copied ? "Copied" : "Copy"}</Button>
        </div>
        {canShare && <Button variant="primary" onClick={() => navigator.share({ title: tripName, text: `Join our trip “${tripName}” on Tripanize`, url: link.url }).catch(() => {})}>Share link</Button>}
        <p className="text-sage-ink">This link is shown only once. Share it privately.</p>
        {link.emailStatus === "sent" && <p>We also emailed the invitation.</p>}
        {link.emailStatus === "not_configured" && <p className="text-warn-ink">No email was sent: email delivery isn't set up. Share the link yourself.</p>}
        {link.emailStatus?.startsWith("failed") && <p className="text-danger">The email couldn't be sent ({link.emailStatus.slice(8)}). Share the link yourself.</p>}
        <button type="button" className="font-semibold underline" onClick={() => { setLink(null); setCopied(false); }}>Invite someone else</button>
      </div>
    );
  }

  return (
    <form className={cx("grid gap-3", !compact && "sm:grid-cols-2")} onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const r = await run(() => createInviteAction(tripId, { role: String(f.get("role")) as "COLLABORATOR" | "VIEWER", email: String(f.get("email") || "") || null, travelerId: String(f.get("traveler") || "") || null }));
      if (r) setLink({ url: r.url, emailStatus: r.emailStatus });
    }}>
      <Field label="Email (optional)" htmlFor={`${tripId}-inv-email`} hint="We'll email the link. Only this email can accept it." className={compact ? undefined : "sm:col-span-2"}><Input id={`${tripId}-inv-email`} name="email" type="email" placeholder="friend@example.com" /></Field>
      <Field label="They can" htmlFor={`${tripId}-inv-role`}><Select id={`${tripId}-inv-role`} name="role" defaultValue="COLLABORATOR"><option value="COLLABORATOR">Edit the trip</option><option value="VIEWER">Only view</option></Select></Field>
      {travelers.length > 0 && <Field label="They are" htmlFor={`${tripId}-inv-trav`} hint="Keeps their expense history."><Select id={`${tripId}-inv-trav`} name="traveler" defaultValue=""><option value="">A new traveler</option>{travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>}
      <div className={compact ? undefined : "sm:col-span-2"}><Button type="submit" variant="primary" disabled={pending}>{pending ? "Creating…" : "Create invitation link"}</Button></div>
    </form>
  );
}

/**
 * "Invite" button that opens the invitation form in a dialog, so it can sit on any trip page.
 * The dialog is portalled to <body> so the trip banner's light-on-dark text styles don't reach it.
 */
export function InviteButton({ tripId, tripName, travelers, className, label = "Invite" }: { tripId: string; tripName: string; travelers: Traveler[]; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dialog = (
    <Dialog open={open} onClose={() => setOpen(false)} title="Invite people to this trip">
      <p className="mb-4 text-sm text-muted">Create a link and send it to the people you're travelling with.</p>
      <InviteForm tripId={tripId} tripName={tripName} travelers={travelers} compact />
      <p className="mt-4 text-xs text-muted"><Link href={`/trips/${tripId}/settings#people`} onClick={() => setOpen(false)} className="font-semibold underline">Manage people and pending invitations</Link></p>
    </Dialog>
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "invite-button"}>
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" /></svg>
        {label}
      </button>
      {mounted && createPortal(dialog, document.body)}
    </>
  );
}
