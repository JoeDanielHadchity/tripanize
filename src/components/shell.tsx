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

export function AppHeader({ user, current }: { user: SessionUser; current?: "trips" | "account" }) {
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
          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}
