import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, cx } from "./ui";

/** Both views share one trip section; existing event and reservation links keep working. */
export function EventsBookingsSection({ tripId, selected, children, premium = true }: {
  tripId: string; selected: "events" | "bookings"; children: ReactNode; premium?: boolean;
}) {
  return (
    <>
      <PageHeader title={premium ? "Events & bookings" : "Your bookings"} subtitle={premium ? "Find events, track reservations and add your own plans in one place." : "Add and manage your reservations manually."} />
      {premium &&
      <nav aria-label="Events and bookings" className="mb-5 flex gap-1 rounded-2xl border border-line bg-surface-2 p-1">
        {(["events", "bookings"] as const).map(view => (
          <Link key={view} href={`/trips/${tripId}/${view}`} aria-current={selected === view ? "page" : undefined}
            className={cx("flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold", selected === view ? "bg-accent text-on-accent" : "text-muted hover:bg-surface")}>
            {view === "events" ? "Events" : "Bookings"}
          </Link>
        ))}
      </nav>}
      {children}
    </>
  );
}
