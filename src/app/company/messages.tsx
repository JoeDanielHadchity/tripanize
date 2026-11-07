"use client";
import { useState } from "react";
import { Badge, Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { useAction, useConfirm } from "@/components/client";
import { broadcastAction } from "@/app/actions/admin-content";

type Reach = { push: number; email: number; people: number };
type Audience = "all" | "buyers" | "recent" | "inactive" | "testers";
type Channels = "push" | "email" | "both";
type Sent = { id: string; title: string; body: string; channels: string; audience: string; status: string; pushQueued: number; emailQueued: number; emailSent: number; emailFailed: number; createdAt: Date | string; sentAt: Date | string | null };

const LINKS: [string, string][] = [["/", "Home"], ["/examples", "Trip ideas"], ["/plans", "Plans & pricing"], ["/trips", "My trips"], ["/destinations", "Find a destination"], ["custom", "Another page…"]];
const when = (d: Date | string) => new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

/** Compose a message (push and/or email), see who it reaches, test it on yourself, then send. */
export function Messages({ audiences, reach, history, optedIn, emailConfigured }: { audiences: Record<Audience, string>; reach: Record<Audience, Reach>; history: Sent[]; optedIn: number; emailConfigured: boolean }) {
  const { run, pending } = useAction(); const ask = useConfirm();
  const [title, setTitle] = useState(""), [body, setBody] = useState("");
  const [link, setLink] = useState("/"), [custom, setCustom] = useState("/");
  const [channels, setChannels] = useState<Channels>(emailConfigured ? "both" : "push");
  const [audience, setAudience] = useState<Audience>("all");
  const r = reach[audience], push = channels !== "email", email = channels !== "push";
  const total = (push ? r.push : 0) + (email ? r.email : 0);
  const href = link === "custom" ? custom : link;
  const input = (test: boolean) => ({ title, body, href, channels, audience, test });
  const ready = title.trim() && body.trim();

  return <div className="space-y-6">
    <form className="grid gap-5 rounded-2xl border border-line bg-surface p-5 lg:grid-cols-[minmax(0,1fr)_18rem]" onSubmit={e => e.preventDefault()}>
      <div className="space-y-4">
        <Field label="Title" hint={`${title.length}/80 · the bold first line of the notification and the email subject`} htmlFor="m-title"><Input id="m-title" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder="New: trip ideas for Lisbon" /></Field>
        <Field label="Message" hint={`${body.length}/500 · push shows the first ~100 characters`} htmlFor="m-body"><Textarea id="m-body" rows={4} value={body} maxLength={500} onChange={e => setBody(e.target.value)} placeholder="A ready-made 4-day plan you can copy and make your own." /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Opens" htmlFor="m-link"><Select id="m-link" value={link} onChange={e => setLink(e.target.value)}>{LINKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          {link === "custom" && <Field label="Page" hint="A Tripanize page, e.g. /examples/paris" htmlFor="m-custom"><Input id="m-custom" value={custom} maxLength={300} onChange={e => setCustom(e.target.value)} /></Field>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Send as" htmlFor="m-ch"><Select id="m-ch" value={channels} onChange={e => setChannels(e.target.value as Channels)}><option value="both" disabled={!emailConfigured}>Push and email</option><option value="push">App push only</option><option value="email" disabled={!emailConfigured}>Email only</option></Select></Field>
          <Field label="To" htmlFor="m-aud"><Select id="m-aud" value={audience} onChange={e => setAudience(e.target.value as Audience)}>{(Object.keys(audiences) as Audience[]).map(a => <option key={a} value={a}>{audiences[a]} ({reach[a].people})</option>)}</Select></Field>
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-2xl bg-night p-4 text-night-ink" aria-label="Push preview">
          <p className="text-xs uppercase tracking-wide text-night-muted">Preview</p>
          <div className="mt-2 rounded-xl bg-night-line p-3"><p className="text-xs text-night-muted">Tripanize · now</p><p className="mt-1 text-sm font-semibold">{title || "Your title"}</p><p className="text-sm text-night-muted">{(body || "Your message").slice(0, 110)}{body.length > 110 ? "…" : ""}</p></div>
        </div>
        <div className="rounded-2xl border border-line p-4 text-sm">
          <p className="font-semibold">This reaches</p>
          {push && <p className="mt-1">{r.push} {r.push === 1 ? "phone" : "phones"} by push</p>}
          {email && <p>{r.email} by email <span className="text-muted">(opted in)</span></p>}
          <p className="mt-2 text-xs text-muted">Push goes to people with the app and news alerts on. Email only to the {optedIn} people who chose to get Tripanize news.</p>
        </div>
        <Button className="w-full" disabled={pending || !ready} onClick={async () => { const res = await run(() => broadcastAction(input(true)), { refresh: false, success: "Test sent to you only" }); if (res?.noDevice) await ask({ title: "No push sent", message: `${email ? "The test email is on its way. " : ""}Your account has no phone with the app and news alerts turned on, so no push was sent.`, confirmLabel: "OK" }); }}>Send a test to me</Button>
        <Button className="w-full" variant="primary" disabled={pending || !ready || total === 0} onClick={async () => { if (await ask({ title: `Send to ${total} ${total === 1 ? "person" : "people"}?`, message: `"${title}" goes to ${audiences[audience].toLowerCase()}. This can't be unsent.`, confirmLabel: "Send now" })) { const res = await run(() => broadcastAction(input(false)), { success: "Sending. Push arrives within a minute; emails go out over the next few minutes." }); if (res) { setTitle(""); setBody(""); } } }}>{pending ? "Sending…" : `Send to ${total}`}</Button>
      </div>
    </form>
    {!emailConfigured && <Notice tone="warn">Email isn't set up on the server, so only push can be sent. See Health.</Notice>}
    <section><h3 className="font-semibold">Sent messages</h3>
      {!history.length ? <p className="mt-2 text-sm text-muted">Nothing sent yet.</p> : <ul className="mt-3 space-y-3">{history.map(m => <li key={m.id} className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{m.title}</p><Badge tone={m.status === "SENT" ? "accent" : "warn"}>{m.status === "SENT" ? "Sent" : "Sending"}</Badge></div>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{m.body}</p>
        <p className="mt-2 text-xs text-muted">{when(m.sentAt ?? m.createdAt)} · {audiences[m.audience as Audience] ?? m.audience} · {m.channels !== "email" ? `${m.pushQueued} push` : ""}{m.channels === "both" ? " · " : ""}{m.channels !== "push" ? `${m.emailSent}/${m.emailQueued} emails${m.emailFailed ? `, ${m.emailFailed} failed` : ""}` : ""}</p>
      </li>)}</ul>}
    </section>
  </div>;
}
