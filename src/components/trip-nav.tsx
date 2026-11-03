"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";
import { PremiumStar } from "./premium-star";
import { newerChatSummary, type ChatSummary } from "@/lib/chat";

const TODAY = { slug: "today", label: "Today", icon: "M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 16a4 4 0 100-8 4 4 0 000 8z" } as const;

const SECTIONS = [
  { slug: "itinerary", label: "Itinerary", icon: "M4 6h16M4 12h10M4 18h7" },
  { slug: "expenses", label: "Expenses", icon: "M4 7h16v10H4zM8 12h.01M16 12h.01M12 10a2 2 0 110 4 2 2 0 010-4z" },
  { slug: "chat", label: "Chat & locations", icon: "M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z" },
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

/**
 * One navigation per breakpoint: a row of pills on desktop, a floating dark tab bar (with "More") on phones.
 * While the trip is happening (`live`), "Today" comes first, and on phones Expenses and Chat stay in the bar.
 */
export function TripNav({ tripId, initialChat, premium = true, live = false }: { tripId: string; initialChat: ChatSummary; premium?: boolean; live?: boolean }) {
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
  const unreadBadge = premium && chat.unread > 0 ? <span aria-label={`${chat.unread} unread chat messages`} className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-on-accent">{chat.unread > 99 ? "99+" : chat.unread}</span> : null;
  const destination = (slug: string) => `/trips/${tripId}/${slug === "events" && !premium ? "bookings" : slug}`;
  const label = (slug: string, text: string) => <span className="inline-flex items-center justify-center gap-1">{slug === "events" && !premium ? "Bookings & votes" : text}{(["expenses", "chat"].includes(slug) || (slug === "events" && premium)) && <PremiumStar />}</span>;
  const active = (slug: string) => path.startsWith(`/trips/${tripId}/${slug}`)
    || (slug === "itinerary" && ["plan", ...(live ? [] : ["today"])].some(s => path.startsWith(`/trips/${tripId}/${s}`)))
    || (slug === "chat" && path.startsWith(`/trips/${tripId}/members`))
    || (slug === "events" && ["bookings", "votes"].some(view => path.startsWith(`/trips/${tripId}/${view}`)));
  const sections = live ? [TODAY, ...SECTIONS] : SECTIONS;
  const primary = sections.slice(0, 4);
  const rest = sections.slice(4);
  return (
    <>
      <nav aria-label="Trip sections" className="mb-6 hidden lg:block">
        <ul className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <li key={s.slug}>
              <Link href={destination(s.slug)} aria-current={active(s.slug) ? "page" : undefined} className={cx("flex min-h-11 items-center gap-2 rounded-full px-5 text-[15px] font-bold", active(s.slug) ? "bg-night text-night-ink" : "border border-line bg-surface text-ink hover:bg-surface-2")}>
                {label(s.slug, s.label)}
                {s.slug === "chat" && unreadBadge}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Trip sections" className="trip-tabbar fixed inset-x-3 z-30 overflow-hidden rounded-[30px] bg-night text-night-muted shadow-[0_12px_30px_rgb(23_46_51/0.3)] lg:hidden">
        {more && (
          <ul className={cx("grid gap-1 border-b border-night-line px-2 py-2", rest.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
            {rest.map((s) => (
              <li key={s.slug}>
                <Link href={destination(s.slug)} onClick={() => setMore(false)} aria-current={active(s.slug) ? "page" : undefined} className={cx("flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[20px] px-1 text-center text-xs font-bold", active(s.slug) ? "bg-[#0f7f86] text-white" : "text-night-muted")}>
                  <Icon d={s.icon} />
                  {label(s.slug, s.label)}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <ul className="grid grid-cols-5 gap-1 p-1.5">
          {primary.map((s) => (
            <li key={s.slug}>
              <Link href={destination(s.slug)} onClick={() => setMore(false)} aria-current={active(s.slug) ? "page" : undefined} className={cx("flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[24px] px-1 text-center text-xs font-bold leading-tight", active(s.slug) ? "bg-[#0f7f86] text-white" : "text-night-muted")}>
                <span className="relative"><Icon d={s.icon} />{s.slug === "chat" && unreadBadge && <span className="absolute -right-4 -top-1">{unreadBadge}</span>}</span>
                {label(s.slug, s.label)}
              </Link>
            </li>
          ))}
          <li>
            <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className={cx("flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-[24px] text-xs font-bold", rest.some((s) => active(s.slug)) ? "bg-[#0f7f86] text-white" : "text-night-muted")}>
              <Icon d="M5 12h.01M12 12h.01M19 12h.01" />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
