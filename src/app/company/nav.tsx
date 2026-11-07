import Link from "next/link";
import type { ReactNode } from "react";
import { ADMIN_GROUPS, type AdminTab } from "@/lib/admin";

/** Simple line icons (24×24, stroke) for the admin sidebar and quick actions. */
const PATHS: Record<string, ReactNode> = {
  overview: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5.5 5.5 0 0 1 3.5 6" /></>,
  trials: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S12 8 12 8zM12 8c2-4 6-4 6-1.5S12 8 12 8z" /></>,
  trips: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  payments: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6.5 15h4" /></>,
  ai: <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />,
  ideas: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
  texts: <><path d="M4 6h16M4 12h10M4 18h7" /><path d="M17 14l3 3-4 4h-3v-3z" /></>,
  announcements: <><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M17 8a5 5 0 0 1 0 8" /></>,
  messages: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />,
  support: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6" /></>,
  health: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  visitors: <path d="M3 20h18M5 16l4-5 4 3 6-8" />,
  activity: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.01" /></>,
};
export function AdminIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{PATHS[name] ?? PATHS.overview}</svg>;
}

/** Dark grouped sidebar; a horizontal strip on small screens. */
export function AdminNav({ tab, badges }: { tab: AdminTab; badges: Partial<Record<AdminTab, number>> }) {
  return <nav aria-label="Administration sections" className="flex gap-1 overflow-x-auto rounded-2xl bg-night p-2 text-night-muted lg:sticky lg:top-20 lg:flex-col lg:gap-0 lg:p-3">
    <p className="hidden px-3 pb-3 pt-1 font-display text-lg font-semibold text-night-ink lg:block">Tripanize admin</p>
    {ADMIN_GROUPS.map(group => <div key={group.label ?? "home"} className="flex shrink-0 gap-1 lg:mb-2 lg:flex-col">
      {group.label && <p className="hidden px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-night-accent lg:block">{group.label}</p>}
      {group.tabs.map(([id, label]) => {
        const on = tab === id, count = badges[id];
        return <Link key={id} href={`/company?tab=${id}`} aria-current={on ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${on ? "bg-accent text-on-accent" : "hover:bg-night-line hover:text-night-ink"}`}>
          <AdminIcon name={id} className="h-[18px] w-[18px]" /><span>{label}</span>
          {!!count && <span className="ml-auto rounded-full bg-ai px-2 text-xs font-semibold leading-5 text-on-ai" aria-label={`${count} need attention`}>{count}</span>}
        </Link>;
      })}
    </div>)}
    <p className="hidden px-3 pt-2 text-xs leading-5 text-night-muted lg:block">Times shown in Riyadh time</p>
  </nav>;
}
