"use client";
import { adminAction } from "@/app/actions/admin";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { useAction } from "@/components/client";
import { createTrialAction, revokeTrialAction } from "@/app/actions/trials";
import type { listCompanyTrials } from "@/server/admin/trials";
type Invitations = Awaited<ReturnType<typeof listCompanyTrials>>;
const emailStatus: Record<string, string> = { queued: "Email queued", sent: "Email accepted by provider", failed: "Email failed", not_configured: "Email unavailable — share the invitation link", cancelled: "Email cancelled" };
export function TrialManager({ invitations }: { invitations: Invitations }) {
  const { run, pending } = useAction();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [duration, setDuration] = useState("14");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [revoke, setRevoke] = useState<string | null>(null);
  return <div className="space-y-6">
    <Card><h2 className="font-display text-xl font-semibold">Invite someone to try Premium</h2><p className="mt-2 text-sm text-muted">They can unlock one Normal trip they organize or start a new trip. No card, subscription or automatic charge. The invitation expires in 14 days if unused. One active trial per recipient; revoke it before inviting them again.</p>
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={async e => { e.preventDefault(); const result = await run(() => createTrialAction(email, duration === "none" ? null : Number(duration)), { success: "Invitation created. Email delivery is queued." }); if (result) { setLink(result.url); setCopied(false); setEmail(""); } }}>
        <div className="min-w-0 flex-1"><Field label="Recipient email" htmlFor="trial-email"><Input id="trial-email" type="email" autoComplete="off" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="traveler@example.com" /></Field></div>
        <Field label="Access after activation" htmlFor="trial-duration"><Select id="trial-duration" value={duration} onChange={e => setDuration(e.target.value)}>{[7,14,30,60,90].map(days => <option key={days} value={days}>{days} days</option>)}<option value="none">Until revoked</option></Select></Field>
        <Button variant="primary" type="submit" disabled={pending}>{pending ? "Creating…" : "Send trial invitation"}</Button>
      </form>
      {link && <div className="mt-4 space-y-3 rounded-xl border border-line bg-bg p-4"><p className="text-sm font-medium">You can also share this private link with the recipient.</p><Input aria-label="Trial invitation link" value={link} readOnly onFocus={e => e.currentTarget.select()} /><Button onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy invitation link"}</Button></div>}
    </Card>
    <section aria-labelledby="trial-history"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="trial-history" className="font-display text-xl font-semibold">Trial invitations</h2><Button onClick={() => router.refresh()}>Refresh delivery status</Button></div>
      {!invitations.length ? <Card className="mt-3"><p className="text-sm text-muted">No trial invitations yet.</p></Card> : <ul className="mt-3 space-y-3">{invitations.map(inv => <li key={inv.id}><Card>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-medium">{inv.email}</p><div className="mt-2 flex flex-wrap gap-2"><Badge tone={inv.status === "Active trial" ? "accent" : "neutral"}>{inv.status}</Badge><Badge>{emailStatus[inv.emailStatus] ?? "Email status pending"}</Badge>{inv.converted && <Badge tone="accent">Converted to paid</Badge>}</div><p className="mt-2 text-sm text-muted">{inv.tripName ? `Trial trip: ${inv.tripName}` : inv.status === "Invitation pending" ? `Accept by ${new Date(inv.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh" })}` : "One trip per invitation"}</p>{inv.tripId && <p className="mt-1 text-xs text-muted">{inv.trialEndsAt ? `Trial access ends ${new Date(inv.trialEndsAt).toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh" })}` : "Trial access lasts until revoked"}</p>}</div>
        {inv.status === "Active trial" && <TrialExpiry id={inv.id} endsAt={inv.trialEndsAt} />}{inv.status !== "Revoked" && <Button disabled={pending} onClick={() => setRevoke(inv.id)}>Revoke {inv.tripId ? "trial" : "invitation"}</Button>}</div>
        {revoke === inv.id && <Notice className="mt-3" tone="warn"><p>{inv.tripId ? "End this complimentary trial? Saved trip data stays. Any paid Premium access stays active." : "Revoke this invitation? It will no longer unlock a trip."}</p><div className="mt-3 flex gap-2"><Button disabled={pending} onClick={async () => { const result = await run(() => revokeTrialAction(inv.id), { success: "Trial access revoked" }); if (result !== null) setRevoke(null); }}>Confirm revocation</Button><Button onClick={() => setRevoke(null)}>Keep access</Button></div></Notice>}
      </Card></li>)}</ul>}
    </section>
  </div>;
}

function TrialExpiry({ id, endsAt }: { id: string; endsAt: string | null }) {
  const { run, pending } = useAction();
  const [days, setDays] = useState("14");
  return <div className="flex items-end gap-2"><Field label="Change trial expiry" htmlFor={`expiry-${id}`}><Select id={`expiry-${id}`} value={days} onChange={e => setDays(e.target.value)}><option value="7">7 days from now</option><option value="14">14 days from now</option><option value="30">30 days from now</option><option value="none">Until revoked</option></Select></Field><Button disabled={pending} onClick={() => run(() => adminAction({ op: "trial.expiry", id, endsAt: days === "none" ? null : new Date(Date.now() + Number(days) * 86400000).toISOString() }), { success: "Trial expiry updated" })}>Save expiry</Button></div>;
}
