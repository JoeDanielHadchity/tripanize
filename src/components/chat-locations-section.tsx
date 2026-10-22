import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, cx } from "./ui";

/** Chat and member locations share one section while keeping existing links intact. */
export function ChatLocationsSection({ tripId, selected, children }: {
  tripId: string; selected: "chat" | "members"; children: ReactNode;
}) {
  return (
    <>
      <PageHeader title="Chat & locations" subtitle="Stay in touch and find each other during your trip." />
      <nav aria-label="Chat and member locations" className="mb-5 flex gap-1 rounded-2xl border border-line bg-surface-2 p-1">
        {(["chat", "members"] as const).map(view => (
          <Link key={view} href={`/trips/${tripId}/${view}`} aria-current={selected === view ? "page" : undefined}
            className={cx("flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-center text-sm font-semibold", selected === view ? "bg-accent text-on-accent" : "text-muted hover:bg-surface")}>
            {view === "chat" ? "Chat" : "Member locations"}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
