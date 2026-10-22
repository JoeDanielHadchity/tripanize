"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";
import { newerChatSummary, type ChatSummary } from "@/lib/chat";

const SECTIONS = [
  { slug: "itinerary", label: "Itinerary", icon: "M4 6h16M4 12h10M4 18h7" },
  { slug: "expenses", label: "Expenses", icon: "M4 7h16v10H4zM8 12h.01M16 12h.01M12 10a2 2 0 110 4 2 2 0 010-4z" },
  { slug: "chat", label: "Chat", icon: "M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z" },
  { slug: "members", label: "Member locations", icon: "M12 21s7-6 7-12A7 7 0 005 9c0 6 7 12 7 12zM12 6a3 3 0 100 6 3 3 0 000-6z" },
  { slug: "events", label: "Events & bookings", icon: "M5 5h14v14H5zM5 9h14M9 3v4m6-4v4" },
  { slug: "packing", label: "Packing", icon: "M6 8h12l-1 12H7zM9 8V6a3 3 0 016 0v2" },
  { slug: "settings", label: "Trip settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" },
] as const;

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** One navigation per breakpoint: a sidebar on desktop, a bottom bar (with "More") on phones. */
export function TripNav({ tripId, initialChat }: { tripId: string; initialChat: ChatSummary }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const [chat, setChat] = useState(initialChat);
  const knownChat = useRef(initialChat);
  useEffect(() => { knownChat.current = newerChatSummary(knownChat.current, initialChat); setChat(knownChat.current); }, [initialChat]);
  useEffect(() => {
    const changed = (event: Event) => {
      const next = (event as CustomEvent<ChatSummary & { tripId: string }>).detail;
      if (next?.tripId === tripId) { knownChat.current = newerChatSummary(knownChat.current, next); setChat(knownChat.current); }
    };
    window.addEventListener("tripanize:chat-unread", changed);
    return () => window.removeEventListener("tripanize:chat-unread", changed);
  }, [tripId]);
  const unreadBadge = chat.unread > 0 ? <span aria-label={`${chat.unread} unread chat messages`} className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-on-accent">{chat.unread > 99 ? "99+" : chat.unread}</span> : null;
  const active = (slug: string) => path.startsWith(`/trips/${tripId}/${slug}`)
    || (slug === "itinerary" && ["plan", "today"].some(s => path.startsWith(`/trips/${tripId}/${s}`)))
    || (slug === "events" && path.startsWith(`/trips/${tripId}/bookings`));
  const primary = SECTIONS.slice(0, 4);
  const rest = SECTIONS.slice(4);
  return (
    <>
      <nav aria-label="Trip sections" className="hidden lg:block">
        <ul className="sticky top-20 space-y-1">
          {SECTIONS.map((s) => (
            <li key={s.slug}>
              <Link href={`/trips/${tripId}/${s.slug}`} aria-current={active(s.slug) ? "page" : undefined} className={cx("flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium", active(s.slug) ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
                <Icon d={s.icon} />
                {s.label}
                {s.slug === "chat" && <span className="ml-auto">{unreadBadge}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Trip sections" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        {more && (
          <ul className="grid grid-cols-3 gap-1 border-b border-line px-2 py-2">
            {rest.map((s) => (
              <li key={s.slug}>
                <Link href={`/trips/${tripId}/${s.slug}`} onClick={() => setMore(false)} aria-current={active(s.slug) ? "page" : undefined} className={cx("flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center text-xs font-medium", active(s.slug) ? "bg-accent-soft text-accent-ink" : "text-muted")}>
                  <Icon d={s.icon} />
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <ul className="grid grid-cols-5">
          {primary.map((s) => (
            <li key={s.slug}>
              <Link href={`/trips/${tripId}/${s.slug}`} onClick={() => setMore(false)} aria-current={active(s.slug) ? "page" : undefined} className={cx("flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-center text-[11px] font-medium", active(s.slug) ? "text-accent-ink" : "text-muted")}>
                <span className="relative"><Icon d={s.icon} />{s.slug === "chat" && unreadBadge && <span className="absolute -right-4 -top-1">{unreadBadge}</span>}</span>
                {s.label}
              </Link>
            </li>
          ))}
          <li>
            <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className={cx("flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium", rest.some((s) => active(s.slug)) ? "text-accent-ink" : "text-muted")}>
              <Icon d="M5 12h.01M12 12h.01M19 12h.01" />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
