"use client";

import { useState } from "react";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { useAction, useConfirm } from "@/components/client";
import { addTravelerAction, changeRoleAction, createInviteAction, removeMemberAction, removeTravelerAction, renameTravelerAction, revokeInviteAction, transferOwnerAction } from "@/app/actions/members";
import { deleteTripAction } from "@/app/actions/trips";
import { formatDate } from "@/lib/dates";

type Props = {
  tripId: string; tripName: string; meId: string; role: string; isOwner: boolean; canEdit: boolean; emailReady: boolean; appUrl: string; localOnly: boolean;
  travelers: { id: string; name: string; isChild: boolean; linked: boolean; left: boolean }[];
  members: { userId: string; name: string; email: string | null; role: string }[];
  invitations: { id: string; role: string; email: string | null; expiresAt: string; emailStatus: string | null; traveler: string | null }[];
};

export function SharingPanel(p: Props) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [link, setLink] = useState<{ url: string; emailStatus: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteName, setDeleteName] = useState("");
  const unlinked = p.travelers.filter((t) => !t.linked && !t.left && !t.isChild);

  return (
    <>
      <section id="travelers" aria-labelledby="trav-h" className="scroll-mt-20 space-y-4">
        <h2 id="trav-h" className="font-display text-xl font-semibold">Travelers & sharing</h2>
        <Card>
          <h3 className="font-semibold">Travelers</h3>
          <p className="text-sm text-muted">Everyone who shares costs. People without an account can still be included in expenses; inviting them later links their account to the same traveler, keeping their history.</p>
          <ul className="mt-3 divide-y divide-line">
            {p.travelers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-2">{t.name}{t.isChild && <Badge>Child</Badge>}{t.linked ? <Badge tone="sage">Has account</Badge> : t.left ? <Badge>Left the trip</Badge> : <Badge tone="warn">No account yet</Badge>}</span>
                {p.canEdit && !t.left && (
                  <span className="flex gap-1">
                    <Button className="min-h-10" onClick={async () => { const n = window.prompt("Rename traveler", t.name); if (n && n.trim() !== t.name) run(() => renameTravelerAction(p.tripId, t.id, n), { success: "Renamed" }); }}>Rename</Button>
                    {!t.linked && <Button className="min-h-10" variant="ghost" onClick={async () => { if (await confirm({ title: `Remove ${t.name}?`, message: "If they appear in expenses they're archived instead, so balances stay correct.", danger: true, confirmLabel: "Remove" })) run(() => removeTravelerAction(p.tripId, t.id), { success: "Updated" }); }}>Remove</Button>}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {p.canEdit && (
            <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => addTravelerAction(p.tripId, newName, false), { success: "Traveler added" }); if (r !== null) setNewName(""); }}>
              <Input aria-label="New traveler name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" required maxLength={80} />
              <Button type="submit" disabled={pending}>Add</Button>
            </form>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold">People with access</h3>
          <ul className="mt-2 divide-y divide-line">
            {p.members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{m.name}{m.userId === p.meId ? " (you)" : ""}{m.email && <span className="block text-xs text-muted">{m.email}</span>}</span>
                {m.role === "OWNER" ? <Badge tone="accent">Owner</Badge> : p.isOwner ? (
                  <span className="flex flex-wrap gap-1">
                    <Select aria-label={`Role for ${m.name}`} className="min-h-10 w-auto" value={m.role} onChange={(e) => run(() => changeRoleAction(p.tripId, m.userId, e.target.value as "COLLABORATOR" | "VIEWER"), { success: "Role updated" })}>
                      <option value="COLLABORATOR">Collaborator (can edit)</option>
                      <option value="VIEWER">Viewer (read-only)</option>
                    </Select>
                    <Button className="min-h-10" variant="ghost" onClick={async () => { if (await confirm({ title: `Make ${m.name} the owner?`, message: "You'll become a collaborator. Only the owner can manage access and delete the trip.", confirmLabel: "Transfer ownership" })) run(() => transferOwnerAction(p.tripId, m.userId), { success: "Ownership transferred" }); }}>Make owner</Button>
                    <Button className="min-h-10" variant="danger" onClick={async () => { if (await confirm({ title: `Remove ${m.name}'s access?`, message: "They'll lose access to this trip immediately. Their past expenses stay in the ledger.", danger: true, confirmLabel: "Revoke access" })) run(() => removeMemberAction(p.tripId, m.userId), { success: "Access revoked" }); }}>Revoke</Button>
                  </span>
                ) : <Badge>{m.role === "VIEWER" ? "Viewer" : "Collaborator"}</Badge>}
              </li>
            ))}
          </ul>
        </Card>

        {p.isOwner && (
          <Card>
            <h3 className="font-semibold">Invite someone</h3>
            {p.localOnly ? (
              <Notice tone="warn" className="mt-2" title="Others can't reach this server yet">Invitation links point to {p.appUrl}, which only works on this machine. Deploy Roam to a public address (and set APP_URL) before invited travelers can sign up and accept.</Notice>
            ) : (
              <p className="mt-1 text-xs text-muted">Links point to {p.appUrl}. Recipients must be able to open that address and sign in with their own account.</p>
            )}
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setCopied(false);
              const r = await run(() => createInviteAction(p.tripId, { role: String(f.get("role")) as "COLLABORATOR" | "VIEWER", email: String(f.get("email") || "") || null, travelerId: String(f.get("traveler") || "") || null }));
              if (r) setLink({ url: r.url, emailStatus: r.emailStatus });
            }}>
              <Field label="Role" htmlFor="inv-role"><Select id="inv-role" name="role" defaultValue="COLLABORATOR"><option value="COLLABORATOR">Collaborator — can edit shared trip info</option><option value="VIEWER">Viewer — read-only</option></Select></Field>
              <Field label="Connect to traveler (optional)" htmlFor="inv-trav" hint="Keeps their existing expense history."><Select id="inv-trav" name="traveler" defaultValue=""><option value="">New traveler</option>{unlinked.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
              <Field label="Email (optional)" htmlFor="inv-email" hint="If set, only an account with this email can accept." className="sm:col-span-2"><Input id="inv-email" name="email" type="email" placeholder="friend@example.com" /></Field>
              <div className="sm:col-span-2"><Button type="submit" variant="primary" disabled={pending}>Create invitation link</Button></div>
            </form>
            {link && (
              <div className="mt-4 space-y-2 rounded-xl bg-sage-soft p-3 text-sm">
                <p className="font-semibold text-sage-ink">Invitation link (expires in 7 days, single use)</p>
                <div className="flex gap-2"><Input readOnly value={link.url} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} /><Button onClick={async () => { await navigator.clipboard.writeText(link.url); setCopied(true); }}>{copied ? "Copied" : "Copy"}</Button></div>
                <p className="text-sage-ink">This link is shown only once. Share it privately.</p>
                {link.emailStatus === "sent" && <p>Email accepted by the mail server for delivery.</p>}
                {link.emailStatus === "not_configured" && <p className="text-warn-ink">No email was sent: email delivery isn't configured on this server. Share the link yourself.</p>}
                {link.emailStatus?.startsWith("failed") && <p className="text-danger">The email couldn't be sent ({link.emailStatus.slice(8)}). Share the link yourself.</p>}
              </div>
            )}
            {p.invitations.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold">Pending invitations</h4>
                <ul className="mt-1 divide-y divide-line text-sm">
                  {p.invitations.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{i.role === "VIEWER" ? "Viewer" : "Collaborator"}{i.email ? ` · ${i.email}` : " · anyone with the link"}{i.traveler ? ` · as ${i.traveler}` : ""}<span className="block text-xs text-muted">Expires {formatDate(i.expiresAt.slice(0, 10))}{i.emailStatus ? ` · email: ${i.emailStatus === "not_configured" ? "not sent (not configured)" : i.emailStatus}` : ""}</span></span>
                      <Button className="min-h-10" variant="ghost" onClick={() => run(() => revokeInviteAction(p.tripId, i.id), { success: "Invitation revoked" })}>Revoke</Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!p.emailReady && <p className="mt-3 text-xs text-muted">Email invitations need SMTP configured on the server. Links work without it.</p>}
          </Card>
        )}
      </section>

      <section aria-labelledby="data-h" className="space-y-3">
        <h2 id="data-h" className="font-display text-xl font-semibold">Your data</h2>
        <Card className="flex flex-wrap gap-2">
          <a href={`/api/trips/${p.tripId}/export/json`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-medium">Export full trip (JSON)</a>
          <a href={`/api/trips/${p.tripId}/export/pdf`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-medium">Itinerary PDF</a>
          <p className="w-full text-xs text-muted">Exports include everything you can see in this trip. Other travelers' personal packing lists are never included.</p>
        </Card>
      </section>

      <section aria-labelledby="danger-h" className="space-y-3">
        <h2 id="danger-h" className="font-display text-xl font-semibold text-danger">Leave or delete</h2>
        <Card className="space-y-4 border-danger/30">
          {!p.isOwner && (
            <div>
              <p className="text-sm">Leaving removes your access and your personal packing list. Shared expenses you're part of stay in the ledger.</p>
              <Button className="mt-2" variant="danger" onClick={async () => { if (await confirm({ title: "Leave this trip?", message: "You'll need a new invitation to rejoin.", danger: true, confirmLabel: "Leave trip" })) { const r = await run(() => removeMemberAction(p.tripId, p.meId), { refresh: false }); if (r !== null) window.location.assign("/trips"); } }}>Leave trip</Button>
            </div>
          )}
          {p.isOwner && (
            <form onSubmit={async (e) => { e.preventDefault(); if (!(await confirm({ title: "Delete this trip permanently?", message: "Everything — itinerary, bookings, expenses, files — is deleted for every traveler. This can't be undone. Export first if you want a copy.", danger: true, confirmLabel: "Delete forever" }))) return; const r = await run(() => deleteTripAction(p.tripId, deleteName), { refresh: false }); if (r !== null) window.location.assign("/trips"); }}>
              <Field label={`Type the trip name (“${p.tripName}”) to delete it`} htmlFor="del-name"><Input id="del-name" value={deleteName} onChange={(e) => setDeleteName(e.target.value)} autoComplete="off" /></Field>
              <Button type="submit" variant="danger" className="mt-2" disabled={deleteName.trim() !== p.tripName.trim() || pending}>Delete trip</Button>
            </form>
          )}
        </Card>
      </section>
    </>
  );
}
