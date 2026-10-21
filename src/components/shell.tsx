import Link from "next/link";
import type { SessionUser } from "@/server/auth/session";
import { SignOutButton } from "./signout";

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-hidden viewBox="0 0 32 32" className={small ? "h-7 w-7" : "h-8 w-8"}>
        <circle cx="16" cy="16" r="15" fill="var(--accent)" />
        <path d="M8 21c3-7 6-10 8-10s3 3 8-2" stroke="var(--on-accent)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <circle cx="23.5" cy="9.5" r="2.2" fill="var(--on-accent)" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight">Tripanize</span>
    </span>
  );
}

export function AppHeader({ user, current }: { user: SessionUser; current?: "trips" | "account" | "settings" }) {
  const link = (href: string, label: string, active: boolean) => (
    <Link href={href} aria-current={active ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}>
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/trips" aria-label="Tripanize — my trips">
          <Logo small />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1">
          {link("/trips", "My trips", current === "trips")}
          {link("/account", user.name.split(" ")[0] || "Account", current === "account")}
          <SettingsLink active={current === "settings"} />
          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}

export function SettingsLink({ active = false }: { active?: boolean }) {
  return (
    <Link href="/settings" aria-label="Settings" title="Settings" aria-current={active ? "page" : undefined} className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </Link>
  );
}
