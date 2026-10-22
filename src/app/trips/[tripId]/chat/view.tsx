"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH, CHAT_POLL_MS, mergeChatMessages, newerChatSummary, type ChatMessageView, type ChatPage, type ChatSummary } from "@/lib/chat";
import { formatDate, formatTimestamp, todayIn } from "@/lib/dates";
import { Button, EmptyState, Notice, Textarea, cx } from "@/components/ui";
import { useConfirm } from "@/components/client";
import { useOnline } from "@/components/offline";

type ApiError = Error & { code?: string };
async function request<T>(tripId: string, query = "", body?: object): Promise<T> {
  const result = await fetch(`/api/trips/${tripId}/chat${query}`, { cache: "no-store", signal: AbortSignal.timeout(15_000), ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await result.json() as T & { error?: string; code?: string };
  if (!result.ok) throw Object.assign(new Error(data.error ?? "Chat is unavailable. Please try again."), { code: data.code ?? (result.status === 401 ? "UNAUTHENTICATED" : undefined) });
  return data;
}
const announce = (tripId: string, summary: ChatSummary) => window.dispatchEvent(new CustomEvent("tripanize:chat-unread", { detail: { tripId, ...summary } }));

export function ChatView({ tripId, userId, isOwner, initial }: { tripId: string; userId: string; isOwner: boolean; initial: ChatPage }) {
  const [messages, setMessages] = useState(initial.messages);
  const [summary, setSummary] = useState(initial.summary);
  const [hasOlder, setHasOlder] = useState(initial.hasMore);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const confirm = useConfirm();
  const online = useOnline();
  const feed = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const messageRef = useRef(messages);
  const draftRef = useRef(draft);
  const revision = useRef(initial.revision);
  const readSeq = useRef(initial.summary.readSeq);
  const reading = useRef(false);
  const alive = useRef(true);
  const attempt = useRef<{ clientId: string; body: string } | null>(null);
  const sendBusy = useRef(false);
  const olderAnchor = useRef<{ top: number; height: number } | null>(null);
  messageRef.current = messages; draftRef.current = draft;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const updateSummary = useCallback((next: ChatSummary) => {
    readSeq.current = Math.max(readSeq.current, next.readSeq);
    setSummary(old => newerChatSummary(old, next));
    announce(tripId, next);
  }, [tripId]);
  const apply = useCallback((incoming: ChatMessageView[], history = false) => {
    const pending = attempt.current;
    if (pending && incoming.some(m => m.senderId === userId && m.clientId === pending.clientId)) {
      if (draftRef.current.trim() === pending.body) { draftRef.current = ""; setDraft(""); }
      attempt.current = null; setSendError("");
    }
    setMessages(old => mergeChatMessages(old, incoming, history));
  }, [userId]);
  const deny = useCallback((cause: ApiError) => {
    if (cause.code === "UNAUTHENTICATED" || cause.code === "NOT_FOUND") {
      setBlocked(true); setMessages([]); setDraft(""); attempt.current = null;
      setError("Trip chat is no longer available to this account. Return to My trips to check your access.");
      return true;
    }
    return false;
  }, []);

  const markRead = useCallback(async () => {
    if (reading.current || document.hidden || !navigator.onLine || !nearBottom.current || !alive.current) return;
    const target = messageRef.current.at(-1)?.seq ?? 0;
    if (target <= readSeq.current) return;
    reading.current = true;
    try {
      const next = await request<ChatSummary>(tripId, "", { op: "read", seq: target });
      if (alive.current) { updateSummary(next); window.dispatchEvent(new Event("tripanize:notifications")); }
    } catch (cause) { if (alive.current) deny(cause as ApiError); }
    finally { reading.current = false; }
  }, [tripId, updateSummary, deny]);

  useEffect(() => {
    if (blocked) return;
    let stopped = false;
    let busy = false;
    async function check() {
      if (busy || document.hidden || !navigator.onLine || stopped) return;
      busy = true;
      try {
        for (let page = 0; page < 5; page++) {
          const next = await request<ChatPage>(tripId, `?since=${revision.current}`);
          if (stopped || document.hidden) return;
          apply(next.messages);
          revision.current = Math.max(revision.current, next.revision);
          updateSummary(next.summary); setError("");
          if (!next.hasMore) break;
        }
        void markRead();
      } catch (cause) { if (!stopped && !deny(cause as ApiError)) setError("Couldn’t refresh chat. Reconnecting… Your draft is still here."); }
      finally { busy = false; }
    }
    void check();
    const timer = setInterval(check, CHAT_POLL_MS);
    document.addEventListener("visibilitychange", check); window.addEventListener("online", check);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", check); window.removeEventListener("online", check); };
  }, [tripId, blocked, refresh, apply, updateSummary, markRead, deny]);

  useLayoutEffect(() => {
    const element = feed.current;
    if (!element) return;
    if (olderAnchor.current) {
      element.scrollTop = olderAnchor.current.top + element.scrollHeight - olderAnchor.current.height;
      olderAnchor.current = null;
    } else if (nearBottom.current) element.scrollTop = element.scrollHeight;
    if (nearBottom.current) void markRead();
  }, [messages, markRead]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draftRef.current.trim();
    if (!body || body.length > CHAT_MAX_LENGTH || sendBusy.current || blocked || !online) return;
    const pending = attempt.current?.body === body ? attempt.current : { clientId: crypto.randomUUID(), body };
    attempt.current = pending; sendBusy.current = true; setSending(true); setSendError("");
    try {
      const message = await request<ChatMessageView>(tripId, "", { op: "send", ...pending });
      if (!alive.current) return;
      nearBottom.current = true; setAtBottom(true); apply([message]);
    } catch (cause) {
      if (alive.current && !deny(cause as ApiError) && attempt.current?.clientId === pending.clientId) setSendError((cause as ApiError).message || "Couldn’t confirm sending. Retry to check this same message without sending a duplicate.");
    } finally { sendBusy.current = false; if (alive.current) setSending(false); }
  }
  async function earlier() {
    const first = messageRef.current[0];
    if (!first || loadingOlder || blocked) return;
    setLoadingOlder(true);
    try {
      const next = await request<ChatPage>(tripId, `?before=${first.seq}`);
      if (!alive.current) return;
      if (feed.current) olderAnchor.current = { top: feed.current.scrollTop, height: feed.current.scrollHeight };
      nearBottom.current = false; setAtBottom(false); apply(next.messages, true); setHasOlder(next.hasMore);
    } catch (cause) { if (alive.current && !deny(cause as ApiError)) setError("Couldn’t load earlier messages. Please try again."); }
    finally { if (alive.current) setLoadingOlder(false); }
  }
  async function remove(message: ChatMessageView) {
    if (deleting || !await confirm({ title: "Delete message?", message: "The message text will be removed from this trip’s chat for everyone.", confirmLabel: "Delete message", danger: true })) return;
    setDeleting(message.id);
    try { const next = await request<ChatMessageView>(tripId, "", { op: "delete", id: message.id }); if (alive.current) apply([next]); }
    catch (cause) { if (alive.current && !deny(cause as ApiError)) setError((cause as ApiError).message); }
    finally { if (alive.current) setDeleting(null); }
  }

  return <div className="space-y-3">
    <p className="text-xs text-muted">Only current trip members can read and post here. New messages appear automatically while this page is open.</p>
    {(error || !online) && <Notice tone="warn">{!online ? "You’re offline. Your draft stays here; reconnect to send and receive messages." : error} {blocked ? <Link href="/trips" className="font-semibold underline">My trips</Link> : <button type="button" className="font-semibold underline" onClick={() => setRefresh(n => n + 1)}>Retry</button>}</Notice>}
    <div className="flex h-[72dvh] min-h-[28rem] max-h-[50rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div ref={feed} role="log" aria-label="Trip chat messages" aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={e => { const el = e.currentTarget; const close = el.scrollHeight - el.scrollTop - el.clientHeight < 80; nearBottom.current = close; setAtBottom(close); if (close) void markRead(); }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
        {hasOlder && <div className="mb-4 text-center"><Button variant="ghost" disabled={loadingOlder || blocked} onClick={earlier}>{loadingOlder ? "Loading…" : "Load earlier messages"}</Button></div>}
        {!messages.length && <EmptyState title={blocked ? "Chat unavailable" : "Start the conversation"}>{blocked ? "You need access to this trip to view its chat." : "Coordinate meetups, ask a question or share a quick update with your travel group."}</EmptyState>}
        {messages.map((message, index) => {
          const mine = message.senderId === userId;
          const day = todayIn(initial.timezone, new Date(message.createdAt));
          const previous = messages[index - 1];
          const newDay = !previous || todayIn(initial.timezone, new Date(previous.createdAt)) !== day;
          return <div key={message.id}>
            {newDay && <p className="my-4 text-center text-xs font-medium text-muted">{formatDate(day, { day: "numeric", month: "short", year: "numeric" })}</p>}
            <div className={cx("mb-3 flex", mine ? "justify-end" : "justify-start")}>
              <div className="min-w-0 max-w-[90%] sm:max-w-[78%]">
                <p className={cx("mb-1 text-xs font-medium text-muted", mine && "text-right")}>{mine ? "You" : message.senderName || "Trip member"}</p>
                <div className={cx("rounded-2xl px-4 py-2.5", mine ? "rounded-br-sm bg-accent-soft text-accent-ink" : "rounded-bl-sm border border-line bg-surface-2 text-ink")}>
                  <p className={cx("whitespace-pre-wrap break-words text-[15px] [overflow-wrap:anywhere]", message.deletedAt && "italic text-muted")}>{message.deletedAt ? "Message deleted" : message.body}</p>
                </div>
                <div className={cx("mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-muted", mine && "justify-end")}><time dateTime={message.createdAt}>{formatTimestamp(message.createdAt, initial.timezone)}</time>{!message.deletedAt && (mine || isOwner) && <button type="button" className="min-h-8 hover:text-danger" disabled={Boolean(deleting) || blocked || !online} aria-label={`Delete message from ${mine ? "you" : message.senderName} at ${formatTimestamp(message.createdAt, initial.timezone)}`} onClick={() => remove(message)}>{deleting === message.id ? "Deleting…" : "Delete"}</button>}</div>
              </div>
            </div>
          </div>;
        })}
      </div>
      {!atBottom && <div className="border-t border-line bg-surface-2 px-3 py-1 text-center"><Button variant="ghost" onClick={() => { nearBottom.current = true; setAtBottom(true); if (feed.current) feed.current.scrollTop = feed.current.scrollHeight; void markRead(); }}>{summary.unread ? `${summary.unread} unread · ` : ""}Jump to latest ↓</Button></div>}
      <form className="border-t border-line p-3 sm:p-4" onSubmit={send}>
        <label htmlFor="chat-message" className="sr-only">Message your trip</label>
        <div className="flex items-end gap-2"><Textarea id="chat-message" rows={2} maxLength={CHAT_MAX_LENGTH} placeholder="Message your trip…" value={draft} disabled={blocked} onChange={e => { draftRef.current = e.target.value; setDraft(e.target.value); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} className="max-h-48 min-h-20 flex-1 resize-y" /><Button type="submit" variant="primary" disabled={sending || !draft.trim() || !online || blocked}>{sending ? "Sending…" : "Send"}</Button></div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted"><span>Enter to send · Shift + Enter for a new line</span><span>{draft.length.toLocaleString("en")} / 4,000</span></div>
        {sendError && <p role="alert" className="mt-2 text-sm text-danger">{sendError} Your message stays in the box so you can retry.</p>}
      </form>
    </div>
    <p className="text-xs text-muted">Chat alerts appear in the notification bell. Message text isn’t sent by email or saved in offline trip copies. You can delete your own messages; the trip owner can moderate the conversation.</p>
  </div>;
}
