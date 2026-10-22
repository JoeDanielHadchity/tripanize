"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsReadAction, changeEmailPreferenceAction } from "@/app/actions/notifications";
import type { listChangeNotifications } from "@/server/notifications/changes";
import { Dialog, useAction, useToast } from "./client";
import { Button, Card, EmptyState, Notice, cx } from "./ui";
import { formatTimestamp } from "@/lib/dates";

type Inbox = Awaited<ReturnType<typeof listChangeNotifications>>;
const updated = () => window.dispatchEvent(new Event("tripanize:notifications"));
async function fetchInbox(cursor?: string): Promise<Inbox> {
  const res = await fetch(`/api/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn’t load notifications. Try again.");
  return res.json();
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    async function check() {
      if (document.hidden || !navigator.onLine) return;
      try { const inbox = await fetchInbox(); if (!stopped) { setData(inbox); setError(""); } }
      catch { if (!stopped) setError("Couldn’t load notifications. Open again to retry."); }
    }
    void check();
    const timer = setInterval(check, 15000);
    window.addEventListener("tripanize:notifications", check);
    document.addEventListener("visibilitychange", check);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("tripanize:notifications", check); document.removeEventListener("visibilitychange", check); };
  }, []);
  const unread = data?.unread ?? 0;
  return <>
    <button type="button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications" onClick={() => { setOpen(true); updated(); }} className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unread > 0 && <span aria-hidden className="absolute right-0 top-0 min-w-4 rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">{unread > 99 ? "99+" : unread}</span>}
    </button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Notifications">
      {error ? <Notice tone="warn">{error}</Notice> : !data ? <p className="text-sm text-muted">Loading updates…</p> : <>
        <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm text-muted">{unread} unread</p><MarkAllRead data={data} /></div>
        <NotificationItems items={data.items.slice(0, 8)} timezone={data.timezone} onOpen={() => setOpen(false)} />
      </>}
      <Link href="/notifications" onClick={() => setOpen(false)} className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-line text-sm font-medium hover:bg-surface-2">All updates & email settings</Link>
    </Dialog>
  </>;
}

function MarkAllRead({ data, onRead }: { data: Inbox; onRead?: () => void }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return <Button variant="ghost" disabled={!data.unread || pending} onClick={() => start(async () => {
    const result = await markNotificationsReadAction({ before: data.checkedAt });
    if (result.ok) { updated(); onRead?.(); } else toast({ tone: "error", message: result.error });
  })}>Mark all read</Button>;
}

function NotificationItems({ items, timezone, onOpen }: { items: Inbox["items"]; timezone: string; onOpen?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  if (!items.length) return <EmptyState title="You’re all caught up"><p>Changes made by other trip members will appear here.</p></EmptyState>;
  return <ul className="divide-y divide-line">{items.map(n => <li key={n.id}>
    <button type="button" disabled={pending} onClick={() => start(async () => {
      const result = await markNotificationsReadAction({ id: n.id });
      if (!result.ok) { toast({ tone: "error", message: result.error }); return; }
      updated(); onOpen?.(); router.push(n.href);
    })} className={cx("flex w-full gap-3 rounded-xl p-3 text-left hover:bg-surface-2 disabled:opacity-60", !n.readAt && "bg-accent-soft/40")}>
      <span className={cx("mt-2 h-2 w-2 shrink-0 rounded-full", !n.readAt ? "bg-accent" : "bg-line")} aria-label={n.readAt ? "Read" : "Unread"} />
      <span className="min-w-0"><span className="block text-xs font-medium text-muted">{n.tripName}</span><span className={cx("mt-0.5 block text-sm", !n.readAt && "font-semibold")}>{n.summary}</span><time dateTime={n.createdAt} className="mt-1 block text-xs text-muted">{formatTimestamp(n.createdAt, timezone)}</time></span>
    </button>
  </li>)}</ul>;
}

export function NotificationsInbox({ initial }: { initial: Inbox }) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function load(more = false) {
    setPending(true); setError("");
    try { const next = await fetchInbox(more ? data.nextCursor ?? undefined : undefined); setData(old => ({ ...next, items: more ? [...old.items, ...next.items] : next.items })); }
    catch { setError("Couldn’t load updates. Please try again."); }
    finally { setPending(false); }
  }
  return <Card>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted">{data.unread} unread · Latest changes first</p><div className="flex gap-1"><Button variant="ghost" disabled={pending} onClick={() => load()}>Refresh</Button><MarkAllRead data={data} onRead={() => { void load(); }} /></div></div>
    {error && <Notice tone="warn" className="mb-3">{error}</Notice>}
    <NotificationItems items={data.items} timezone={data.timezone} />
    {data.nextCursor && <Button className="mt-4 w-full" disabled={pending} onClick={() => load(true)}>{pending ? "Loading…" : "Load earlier updates"}</Button>}
  </Card>;
}

export function TripChangeAlerts({ tripId, enabled, emailReady, email, verified }: { tripId: string; enabled: boolean; emailReady: boolean; email: string; verified: boolean }) {
  const { run, pending } = useAction();
  const [checked, setChecked] = useState(enabled);
  return <section id="notifications" aria-labelledby={`notifications-${tripId}`} className="scroll-mt-20">
    <Card>
      <h2 id={`notifications-${tripId}`} className="font-display text-xl font-semibold">My trip change alerts</h2>
      <p className="mt-1 text-sm text-muted">The bell shows changes other members make to your itinerary, bookings, expenses, events and other shared trip details. Your own edits and personal packing stay quiet.</p>
      <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); void run(() => changeEmailPreferenceAction(tripId, checked), { success: "Trip change email preferences saved", refresh: false }); }}>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" className="h-5 w-5 shrink-0" checked={checked} onChange={e => setChecked(e.target.checked)} disabled={!emailReady || !verified} /> Also email me after each shared change</label>
        <p className="text-xs text-muted">Emails go to {email}. This setting only affects your account and future changes; you can turn it off anytime.</p>
        {!emailReady && <Notice tone="warn">Email delivery is unavailable. In-app alerts are still on.</Notice>}
        {!verified && <Notice tone="warn">Sign in with an email code to verify your address before enabling emails.</Notice>}
        <Button type="submit" disabled={pending || (!enabled && (!emailReady || !verified))}>Save change alerts</Button>
      </form>
    </Card>
  </section>;
}
