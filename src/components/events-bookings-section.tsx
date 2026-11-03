import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, cx } from "./ui";
import { PremiumStar } from "./premium-star";

/** Both views share one trip section; existing event and reservation links keep working. */
export function EventsBookingsSection({ tripId, selected, children, premium = true }: {
  tripId: string; selected: "events" | "bookings" | "votes"; children: ReactNode; premium?: boolean;
}) {
  return (
    <>
      <PageHeader title={premium ? "Events & bookings" : "Bookings & group votes"} subtitle={premium ? "Find events, track reservations and add your own plans in one place." : "Manage your reservations and make decisions together."} />
      <nav aria-label="Events and bookings" className="mb-5 flex flex-wrap gap-1 rounded-[26px] border border-line bg-surface p-1">
        {(["events", "bookings", "votes"] as const).map(view => (
          <Link key={view} href={`/trips/${tripId}/${view}`} aria-current={selected === view ? "page" : undefined}
            className={cx("flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-bold", selected === view ? "bg-night text-night-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
            {view === "events" ? <span className="inline-flex items-center gap-1.5">Events <PremiumStar className="text-current" /></span> : view === "votes" ? "Group votes" : "Bookings"}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
