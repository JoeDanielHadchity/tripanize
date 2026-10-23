"use client";
import { PremiumStar } from "./premium-star";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "./client";
import { Badge, Button, Notice, Textarea, cx } from "./ui";
import { useOnline } from "./offline";
import { ASSISTANT_MAX_MESSAGE, type AssistantConversation, type AssistantPreview, type AssistantStopPreview } from "@/lib/trip-assistant";
import { formatDate } from "@/lib/dates";

type ApiError = Error & { code?: string };
async function request(tripId: string, body?: object): Promise<AssistantConversation> {
  const response = await fetch(`/api/trips/${tripId}/assistant`, { cache: "no-store", signal: AbortSignal.timeout(20_000), ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json() as AssistantConversation & { error?: string; code?: string };
  if (!response.ok) throw Object.assign(new Error(result.error ?? "The assistant is unavailable. Please try again."), { code: result.code ?? (response.status === 401 ? "UNAUTHENTICATED" : undefined) });
  return result;
}

export function TripAssistant({ tripId, defaultDate }: { tripId: string; defaultDate: string | null }) {
  const router = useRouter(), online = useOnline();
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<AssistantConversation | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const feed = useRef<HTMLDivElement>(null), nearBottom = useRef(true), busy = useRef(false);
  const attempt = useRef<{ clientId: string; message: string; selectedDate: string | null } | null>(null);
  const active = conversation?.turns.find(t => t.status === "QUEUED" || t.status === "RUNNING");
  const turns = conversation?.turns ?? [];
  function problem(cause: unknown) {
    const e = cause as ApiError;
    if (e.code === "NOT_FOUND" || e.code === "UNAUTHENTICATED") { setConversation(null); setBlocked(true); }
    setError(e.message || "Couldn’t connect to the assistant. Your itinerary was not changed.");
  }
  useEffect(() => {
    if (!open || !online || blocked) return;
    let stopped = false, loading = false;
    async function load() {
      if (loading || document.hidden || busy.current) return;
      loading = true;
      try { const result = await request(tripId); if (!stopped) { setConversation(result); setError(""); } }
      catch (e) { if (!stopped) problem(e); }
      finally { loading = false; }
    }
    void load();
    const timer = setInterval(load, 3000);
    document.addEventListener("visibilitychange", load);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [tripId, open, online, blocked, refresh]);
  useEffect(() => {
    if (open && nearBottom.current && feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [open, turns.length, turns.at(-1)?.status]);

  async function command(body: object, label: string) {
    if (busy.current) return;
    busy.current = true; setPending(label); setError("");
    try { const result = await request(tripId, body); setConversation(result); return result; }
    catch (e) { problem(e); setRefresh(n => n + 1); }
    finally { busy.current = false; setPending(null); }
  }
  async function send() {
    const message = draft.trim();
    if (!message || message.length > ASSISTANT_MAX_MESSAGE || active || busy.current || !online || !conversation?.aiReady || blocked) return;
    if (!attempt.current || attempt.current.message !== message) {
      const selected = window.location.hash.match(/^#day-(\d{4}-\d{2}-\d{2})$/)?.[1] ?? (window.location.pathname.endsWith("/itinerary") ? defaultDate : null);
      attempt.current = { clientId: crypto.randomUUID(), message, selectedDate: selected };
    }
    nearBottom.current = true;
    if (await command({ op: "send", ...attempt.current }, "send")) { setDraft(""); attempt.current = null; }
  }
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="fixed bottom-20 right-4 z-20 inline-flex min-h-12 items-center gap-2 rounded-full border border-accent/30 bg-accent px-4 font-semibold text-on-accent shadow-lg lg:bottom-6 lg:right-6">
      <PremiumStar className="text-current" /> AI assistant
      {active && <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-label="Preparing a reply" />}
    </button>
    <Dialog open={open} onClose={() => setOpen(false)} title="AI trip assistant" wide tall>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <p className="shrink-0 text-xs text-muted">Your conversation is private to you. The assistant uses your trip details and itinerary. Changes are shared with the trip only after you apply them.</p>
        {!online && <Notice tone="warn">You’re offline. Reconnect to use the assistant.</Notice>}
        {error && <Notice tone="warn">{error} {!blocked && <button type="button" className="font-semibold underline" onClick={() => setRefresh(n => n + 1)}>Retry</button>}</Notice>}
        {conversation && !conversation.aiReady && <Notice tone="warn">The AI assistant is not configured yet.</Notice>}
        {conversation && !conversation.canEdit && <Notice>You have view-only access. You can ask about the trip; itinerary changes need an owner or collaborator.</Notice>}
        <div ref={feed} role="log" aria-label="Conversation with AI trip assistant" aria-live="polite" onScroll={() => { const el = feed.current; if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; }} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1">
          {!conversation && !error && <p className="py-8 text-center text-sm text-muted">Loading your assistant…</p>}
          {conversation && !turns.length && <div className="rounded-2xl bg-surface-2 p-4">
            <p className="font-display text-xl font-semibold">What would you like to change?</p>
            <p className="mt-1 text-sm text-muted">Ask me to move activities, switch days, find alternatives or make a day more relaxed.</p>
            <div className="mt-3 flex flex-wrap gap-2">{["Swap day 2 and day 4", "Make day 3 more relaxed", "What’s planned for my first day?"].map(example => <button key={example} type="button" disabled={Boolean(pending)} onClick={() => setDraft(example)} className="min-h-10 rounded-xl border border-line bg-surface px-3 text-left text-xs hover:border-accent">{example}</button>)}</div>
          </div>}
          {turns.map(t => <article key={t.id} className="space-y-2">
            <div className="ml-8 rounded-2xl rounded-br-sm bg-accent-soft px-4 py-3"><p className="text-xs font-semibold text-accent-ink">You</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{t.question}</p></div>
            <div className="mr-2 rounded-2xl rounded-bl-sm border border-line p-4 sm:mr-8">
              <p className="mb-2 text-xs font-semibold text-accent-ink">✦ Tripanize assistant</p>
              {t.reply && <p className="whitespace-pre-wrap break-words text-sm">{t.reply}</p>}
              {["QUEUED", "RUNNING"].includes(t.status) && <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm text-muted">{t.status === "QUEUED" ? "Your request is queued…" : "Reviewing your trip and preparing a reply…"}</p><Button variant="ghost" disabled={Boolean(pending) || !online} onClick={() => command({ op: "cancel", id: t.id }, `cancel:${t.id}`)}>Cancel reply</Button></div>}
              {(t.status === "FAILED" || t.status === "CANCELLED") && <Notice tone={t.status === "FAILED" ? "warn" : "neutral"}>{t.error ?? "Reply cancelled. Your itinerary was not changed."}<button type="button" className="ml-1 font-semibold underline" onClick={() => setDraft(t.question)}>Try this request again</button></Notice>}
              {t.preview && <ProposalPreview preview={t.preview} />}
              {t.sources.length > 0 && <details className="mt-3 text-xs"><summary className="min-h-8 cursor-pointer text-muted">Sources ({t.sources.length})</summary><ul className="space-y-2">{t.sources.map((url, i) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent-ink underline">{i + 1}. {url}</a></li>)}</ul></details>}
              {t.appliedAt ? <div className="mt-3 space-y-2"><Badge tone="sage">Changes applied</Badge><p className="text-xs text-muted">A restorable version was saved in Itinerary → Versions.</p><Link href={`/trips/${tripId}/itinerary${t.preview?.days[0] ? `#day-${t.preview.days[0].date}` : ""}`} onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center text-sm font-semibold text-accent-ink underline">Open updated itinerary</Link></div>
                : t.dismissed ? <p className="mt-3 text-xs text-muted">Proposal dismissed. Nothing was changed.</p>
                : t.preview && t.preview.changes.length > 0 && t.status === "SUCCEEDED" && <div className="mt-3">
                  {t.id !== conversation?.latestId ? <p className="text-xs text-muted">A newer reply replaced this proposal.</p> : <><p className="mb-2 text-xs text-muted">Review the changes above. Applying updates the shared itinerary.</p><div className="flex flex-wrap gap-2"><Button variant="primary" disabled={Boolean(pending) || !online || !conversation.canEdit || Boolean(t.preview.conflicts.length)} onClick={async () => { if (await command({ op: "apply", id: t.id }, `apply:${t.id}`)) router.refresh(); }}>{pending === `apply:${t.id}` ? "Applying…" : "Apply changes"}</Button><Button disabled={Boolean(pending) || !online} onClick={() => command({ op: "dismiss", id: t.id }, `dismiss:${t.id}`)}>Dismiss</Button></div></>}
                </div>}
            </div>
          </article>)}
        </div>
        <form className="shrink-0 space-y-2 border-t border-line pt-3" onSubmit={e => { e.preventDefault(); void send(); }}>
          <label htmlFor={`assistant-message-${tripId}`} className="text-sm font-medium">Ask about this trip</label>
          <Textarea id={`assistant-message-${tripId}`} value={draft} onChange={e => setDraft(e.target.value)} maxLength={ASSISTANT_MAX_MESSAGE} rows={2} placeholder="Move the museum to day 4, or suggest a more relaxed afternoon…" disabled={blocked || !online || conversation?.aiReady === false} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
          <div className="flex items-center justify-between gap-2"><p className="text-[11px] text-muted">{draft.length} / {ASSISTANT_MAX_MESSAGE.toLocaleString()} · Enter to send</p><Button variant="primary" type="submit" disabled={!draft.trim() || Boolean(pending) || Boolean(active) || !online || !conversation?.aiReady || blocked}>{pending === "send" ? "Sending…" : "Ask assistant"}</Button></div>
          <p className="text-[11px] text-muted">Bookings and fixed commitments stay protected. Estimates stay separate from actual expenses.</p>
        </form>
      </div>
    </Dialog>
  </>;
}

function ProposalPreview({ preview }: { preview: AssistantPreview }) {
  function stopList(stops: AssistantStopPreview[]) {
    return !stops.length ? <p className="text-xs text-muted">No activities</p> : <ol className="space-y-1.5">{stops.map((s, i) => <li key={i} className="text-xs"><span className="font-semibold">{s.time ?? "Untimed"}</span> {s.title}{s.duration ? ` · ${s.duration} min` : ""}{s.plan === "B" ? " · Plan B" : ""}{s.protected ? " · protected" : ""}</li>)}</ol>;
  }
  return <div className="mt-3 space-y-3">
    {preview.changes.length > 0 && <div className="rounded-xl bg-surface-2 p-3"><h3 className="text-sm font-semibold">Proposed changes</h3><ul className="mt-2 list-disc space-y-1 pl-4 text-sm">{preview.changes.map((change, i) => <li key={i}>{change}</li>)}</ul></div>}
    {preview.conflicts.length > 0 && <Notice tone="warn" title="This proposal needs adjusting"><ul className="list-disc pl-4">{preview.conflicts.map((warning, i) => <li key={i}>{warning}</li>)}</ul><p className="mt-2">Ask the assistant to adjust it. Your itinerary has not changed.</p></Notice>}
    {preview.warnings.length > 0 && <details className="rounded-xl border border-line p-3 text-xs"><summary className="min-h-6 cursor-pointer font-semibold">Review {preview.warnings.length} note{preview.warnings.length === 1 ? "" : "s"}</summary><ul className="mt-1 list-disc space-y-1 pl-4">{preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
    {preview.days.length > 0 && <details className="rounded-xl border border-line p-3"><summary className="min-h-6 cursor-pointer text-sm font-semibold">Compare before and after ({preview.days.length} day{preview.days.length === 1 ? "" : "s"})</summary><div className="mt-3 space-y-5">{preview.days.map(d => <section key={d.date}><h4 className="mb-2 text-sm font-semibold">{formatDate(d.date)}</h4><div className="grid gap-3 sm:grid-cols-2">{(["before", "after"] as const).map(view => <div key={view} className={cx("rounded-xl p-3", view === "after" ? "bg-accent-soft/50" : "bg-surface-2")}><p className="mb-2 text-xs font-semibold uppercase text-muted">{view === "before" ? "Current" : "Proposed"}</p><p className="mb-2 text-sm font-medium">{view === "before" ? d.beforeTitle : d.afterTitle}</p>{stopList(d[view])}</div>)}</div></section>)}</div></details>}
  </div>;
}
