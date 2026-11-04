import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, cx } from "./ui";
import { PremiumStar } from "./premium-star";

/** Chat, group votes and member locations share one section while keeping existing links intact. */
export function ChatLocationsSection({ tripId, selected, children }: {
  tripId: string; selected: "chat" | "votes" | "members"; children: ReactNode;
}) {
  return (
    <>
      <PageHeader title="Chat & votes" subtitle="Talk, decide together and find each other during your trip." />
      <nav aria-label="Chat, votes and locations" className="mb-5 flex gap-1 rounded-full border border-line bg-surface p-1">
        {(["chat", "votes", "members"] as const).map(view => (
          <Link key={view} href={`/trips/${tripId}/${view}`} aria-current={selected === view ? "page" : undefined}
            className={cx("flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-center text-sm font-bold", selected === view ? "bg-night text-night-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
            <span className="inline-flex items-center gap-1.5">{view === "chat" ? "Chat" : view === "votes" ? "Votes" : "Locations"}{view !== "votes" && <PremiumStar className="text-current" />}</span>
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
