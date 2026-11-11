"use client";
import { useState } from "react";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { useAction } from "@/components/client";
import { adminAction } from "@/app/actions/admin";
import type { AdminCommand } from "@/server/admin/operations";

export function AdminButton({ command, children, confirm = false }: { command: AdminCommand; children: React.ReactNode; confirm?: boolean }) {
  const { run, pending } = useAction(); const [armed, setArmed] = useState(false);
  return <span className="inline-flex flex-wrap items-center gap-2"><Button disabled={pending} onClick={async () => { if (confirm && !armed) { setArmed(true); return; } const result = await run(() => adminAction(command), { success: "Updated" }); if (result !== null) setArmed(false); }}>{pending ? "Working…" : armed ? "Confirm change" : children}</Button>{armed && <Button onClick={() => setArmed(false)}>Cancel</Button>}</span>;
}
export function SuspensionControl({ id, suspended }: { id: string; suspended: boolean }) {
  const { run, pending } = useAction(); const [armed, setArmed] = useState(false); const [reason, setReason] = useState("");
  if (!armed) return <Button onClick={() => setArmed(true)}>{suspended ? "Restore account" : "Suspend account"}</Button>;
  return <Notice tone="warn" className="mt-3"><p>{suspended ? "Restore sign-in access? The user will need to sign in again." : "Suspend sign-in and end this user's sessions? Saved trips and purchases are retained."}</p>{!suspended && <Input className="mt-2" aria-label="Suspension reason" placeholder="Reason (private to you)" maxLength={200} value={reason} onChange={e => setReason(e.target.value)} />}<div className="mt-3 flex gap-2"><Button disabled={pending} onClick={async () => { const result = await run(() => adminAction({ op: "user.suspend", id, suspended: !suspended, reason }), { success: suspended ? "Account restored" : "Account suspended" }); if (result !== null) setArmed(false); }}>Confirm {suspended ? "restoration" : "suspension"}</Button><Button onClick={() => setArmed(false)}>Cancel</Button></div></Notice>;
}
export function SupportEditor({ id, initialStatus, initialNote }: { id: string; initialStatus: string; initialNote: string }) {
  const { run, pending } = useAction(); const [status, setStatus] = useState(initialStatus); const [note, setNote] = useState(initialNote);
  return <form className="mt-5 space-y-3" onSubmit={e => { e.preventDefault(); run(() => adminAction({ op: "support.update", id, status: status as "OPEN" | "IN_PROGRESS" | "RESOLVED", note }), { success: "Support request updated" }); }}><div className="grid gap-3 sm:grid-cols-[12rem_1fr]"><Field htmlFor={`status-${id}`} label="Request status"><Select id={`status-${id}`} value={status} onChange={e => setStatus(e.target.value)}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></Select></Field><Field htmlFor={`note-${id}`} label="Private note"><Textarea id={`note-${id}`} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="Your follow-up notes" /></Field></div><Button type="submit" disabled={pending}>Save request</Button></form>;
}
export function AiSettings({ initial }: { initial: { aiPaused: boolean; aiDailyLimit: number | null; aiUserDailyLimit: number | null; pricingModel: string | null; inputUsdPerMillion: number | null; outputUsdPerMillion: number | null; searchUsdPerThousand: number | null } | null }) {
  const { run, pending } = useAction();
  return <Card><h3 className="font-display text-xl font-semibold">AI controls and estimate rates</h3><p className="mt-2 text-sm text-muted">Daily limits reset at midnight UTC. Existing limits for individual tools still apply. Blank daily limits add no extra daily cap.</p><form className="mt-5 space-y-5" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const number = (key: string) => String(f.get(key) ?? "").trim() === "" ? null : Number(f.get(key)); run(() => adminAction({ op: "ai.settings", aiPaused: f.get("paused") === "on", aiDailyLimit: number("daily"), aiUserDailyLimit: number("userDaily"), pricingModel: String(f.get("model") ?? "").trim() || null, inputUsdPerMillion: number("input"), outputUsdPerMillion: number("output"), searchUsdPerThousand: number("search") }), { success: "AI controls saved" }); }}>
    <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" name="paused" defaultChecked={initial?.aiPaused ?? false} className="h-4 w-4 accent-accent" />Pause new AI requests</label>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Platform requests per day" htmlFor="ai-daily"><Input id="ai-daily" name="daily" type="number" min={1} max={100000} defaultValue={initial?.aiDailyLimit ?? ""} placeholder="No extra daily cap" /></Field><Field label="Requests per user per day" htmlFor="ai-user-daily"><Input id="ai-user-daily" name="userDaily" type="number" min={1} max={100000} defaultValue={initial?.aiUserDailyLimit ?? ""} placeholder="No extra daily cap" /></Field></div>
    <Field label="Model for these rates" htmlFor="ai-model" hint="Use the model name shown in the usage list. Leave rates blank until you know your provider's pricing."><Input id="ai-model" name="model" maxLength={100} defaultValue={initial?.pricingModel ?? ""} placeholder="e.g. your configured model name" /></Field>
    <div className="grid gap-4 sm:grid-cols-3">{[["input","Input USD / 1M tokens",initial?.inputUsdPerMillion],["output","Output USD / 1M tokens",initial?.outputUsdPerMillion],["search","Web search USD / 1,000 calls",initial?.searchUsdPerThousand]].map(([key,label,value]) => <Field key={String(key)} label={String(label)} htmlFor={`ai-${key}`}><Input id={`ai-${key}`} name={String(key)} type="number" min={0} max={10000} step="any" defaultValue={value ?? ""} /></Field>)}</div>
    <p className="text-xs leading-5 text-muted">Estimates use your saved rates for future requests. All reported input tokens use the same input rate, so cached-input discounts and provider-specific charges may differ. Provider billing is authoritative. Unpriced requests remain clearly marked.</p><Button type="submit" variant="primary" disabled={pending}>Save AI controls</Button>
  </form></Card>;
}
export function AnnouncementForm() {
  const { run, pending } = useAction();
  return <Card><h3 className="font-display text-xl font-semibold">Create an announcement</h3><p className="mt-2 text-sm text-muted">Save a draft, then publish when ready. Published announcements appear across Tripanize during their scheduled dates.</p><form className="mt-5 space-y-4" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); const toTime = (key: string) => f.get(key) ? new Date(`${f.get(key)}:00+03:00`).toISOString() : null; const result = await run(() => adminAction({ op: "announcement.create", title: String(f.get("title")), message: String(f.get("message")), tone: String(f.get("tone")) as "info" | "maintenance", startsAt: toTime("starts") ?? new Date().toISOString(), endsAt: toTime("ends") }), { success: "Announcement draft saved" }); if (result !== null) form.reset(); }}>
    <Field label="Title" htmlFor="announcement-title"><Input id="announcement-title" name="title" required maxLength={100} /></Field><Field label="Message" htmlFor="announcement-message"><Textarea id="announcement-message" name="message" required maxLength={1000} /></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Type" htmlFor="announcement-tone"><Select id="announcement-tone" name="tone"><option value="info">News / information</option><option value="maintenance">Maintenance</option></Select></Field><Field label="Start · Riyadh time" htmlFor="announcement-start" hint="Leave blank to start when published."><Input id="announcement-start" name="starts" type="datetime-local" /></Field><Field label="End · Riyadh time" htmlFor="announcement-end" hint="Optional automatic end."><Input id="announcement-end" name="ends" type="datetime-local" /></Field></div><Button type="submit" variant="primary" disabled={pending}>Save draft</Button>
  </form></Card>;
}

/** Users tab: turn credits on for one account before launch, and add or remove credits by hand. */
export function CreditsControl({ id, tester, credits }: { id: string; tester: boolean; credits: number | null }) {
  const { run, pending } = useAction(); const [amount, setAmount] = useState(""); const [note, setNote] = useState("");
  return <div className="mt-4 w-full rounded-xl bg-surface-2 p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Credits{credits !== null ? `: ${credits}` : ""}</p>
      <label className="flex min-h-10 items-center gap-2 text-xs font-medium"><input type="checkbox" className="h-4 w-4 accent-accent" checked={tester} disabled={pending} onChange={e => run(() => adminAction({ op: "credits.tester", id, tester: e.target.checked }), { success: e.target.checked ? "Credits switched on for this account" : "Credits switched off for this account" })} />Credits tester (credits apply before launch)</label></div>
    {(tester || credits !== null) && <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async e => { e.preventDefault(); const n = Number.parseInt(amount, 10); if (!n) return; const r = await run(() => adminAction({ op: "credits.adjust", id, amount: n, note }), { success: n > 0 ? `Added ${n} credits` : `Removed ${-n} credits` }); if (r !== null) { setAmount(""); setNote(""); } }}>
      <Field label="Add or remove" htmlFor={`cr-${id}`} hint="Use a minus sign to remove."><Input id={`cr-${id}`} type="number" inputMode="numeric" min={-100000} max={100000} step={1} value={amount} onChange={e => setAmount(e.target.value)} className="w-32" placeholder="e.g. 100" /></Field>
      <Field label="Note (optional)" htmlFor={`crn-${id}`}><Input id={`crn-${id}`} value={note} maxLength={120} onChange={e => setNote(e.target.value)} placeholder="e.g. Test credits" /></Field>
      <Button type="submit" disabled={pending || !Number.parseInt(amount, 10)}>Save</Button>
    </form>}
  </div>;
}

/** Gift credits to email addresses: existing verified accounts get them now, others when they sign up. */
export function CreditGifts({ gifts }: { gifts: { id: string; email: string; amount: number; note: string | null; createdAt: Date | string; claimedAt: Date | string | null }[] }) {
  const { run, pending } = useAction(); const [emails, setEmails] = useState(""); const [amount, setAmount] = useState("100"); const [note, setNote] = useState("Thank you for testing Tripanize");
  const list = [...new Set(emails.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean))];
  const day = (v: Date | string) => new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return <Card>
    <h3 className="font-display text-xl font-semibold">Gift credits</h3>
    <p className="mt-2 text-sm text-muted">Paste emails (one per line or separated by commas). Accounts that already exist get the credits now; anyone else gets them the first time they sign in with that email, once it's verified. Your administrator account is skipped, as its credits are unlimited.</p>
    <form className="mt-4 space-y-3" onSubmit={async e => { e.preventDefault(); const n = Number.parseInt(amount, 10); if (!n || !list.length) return; const r = await run(() => adminAction({ op: "credits.gift", emails: list, amount: n, note }), { success: `${n} credits gifted to ${list.length} ${list.length === 1 ? "email" : "emails"}` }); if (r !== null) setEmails(""); }}>
      <Field label={`Emails${list.length ? ` (${list.length})` : ""}`} htmlFor="gift-emails"><Textarea id="gift-emails" rows={5} value={emails} onChange={e => setEmails(e.target.value)} placeholder={"sam@gmail.com\nalex@gmail.com"} /></Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Credits each" htmlFor="gift-amount"><Input id="gift-amount" type="number" inputMode="numeric" min={1} max={10000} step={1} value={amount} onChange={e => setAmount(e.target.value)} className="w-32" /></Field>
        <Field label="Note shown in their history" htmlFor="gift-note" className="min-w-0 flex-1"><Input id="gift-note" value={note} maxLength={120} onChange={e => setNote(e.target.value)} /></Field>
        <Button type="submit" variant="primary" disabled={pending || !list.length || !Number.parseInt(amount, 10)}>Gift credits</Button>
      </div>
    </form>
    {gifts.length > 0 && <ul className="mt-5 divide-y divide-line text-sm">{gifts.map(g => <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="min-w-0 break-all">{g.email}</span><span className="text-muted">{g.amount} credits · {day(g.createdAt)} · {g.claimedAt ? `received ${day(g.claimedAt)}` : "waiting for sign-up"}</span></li>)}</ul>}
  </Card>;
}
