import Link from "next/link";
import type { SessionUser } from "@/server/auth/session";
import { SignOutButton } from "./signout";
import { AccountModeSync } from "./account-mode";
import { NotificationBell } from "./notifications";

export function Logo({ small }: { small?: boolean }) {
  return (
    <span role="img" aria-label="Tripanize" className="inline-flex shrink-0 items-center gap-2">
      <img src="/brand/tripanize-mark.png" alt="" aria-hidden="true" width={447} height={410} className={small ? "h-8 w-auto" : "h-9 w-auto sm:h-10"} />
      <img src="/brand/tripanize-wordmark.png" alt="" aria-hidden="true" width={1318} height={332} className={`${small ? "hidden h-6 sm:block" : "h-7 sm:h-8"} w-auto dark:brightness-0 dark:invert`} />
    </span>
  );
}

export function AppHeader({ user, current }: { user: SessionUser; current?: "trips" | "account" | "settings" | "admin" }) {
  const link = (href: string, label: string, active: boolean) => (
    <Link href={href} aria-current={active ? "page" : undefined} className={`max-w-28 truncate rounded-lg px-2 py-2 text-sm font-medium sm:px-3 ${active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"}`}>
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      {user.companyAdminEligible && <AccountModeSync />}
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/start" aria-label="Tripanize home">
          <Logo small />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1">
          {link("/trips", "My trips", current === "trips")}
          {user.companyAdmin && link("/company", "Admin", current === "admin")}
          {link("/account", (user.companyAdminEligible || user.companyAdmin) ? "Account" : user.name.split(" ")[0] || "Account", current === "account")}
          <NotificationBell />
          <SettingsLink active={current === "settings"} />
          <SignOutButton />
        </nav>
      </div>
      {user.normalMode && <div className="border-t border-line bg-accent-soft px-4 py-1.5 text-center text-xs text-accent-ink">Normal mode · Premium included <Link href="/account" className="ml-2 font-semibold underline">Account mode</Link></div>}
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
