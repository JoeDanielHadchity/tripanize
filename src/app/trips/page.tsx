import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { listTrips, type TripCard } from "@/server/trips/service";
import { AppHeader } from "@/components/shell";
import { Badge, EmptyState, LinkButton, PageHeader, cx } from "@/components/ui";
import { formatDateRange, tripLength } from "@/lib/dates";
import { EXAMPLES } from "@/server/examples/data";
import { listPendingInvitations } from "@/server/invitations/service";
import { PendingInvites } from "@/components/pending-invites";

export const metadata: Metadata = { title: "My trips" };

const FILTERS = [
  ["all", "All"],
  ["upcoming", "Upcoming"],
  ["current", "Current"],
  ["past", "Past"],
] as const;

const PHASE: Record<TripCard["phase"], { label: string; tone: "accent" | "sage" | "neutral" | "warn" }> = {
  current: { label: "Happening now", tone: "accent" },
  upcoming: { label: "Upcoming", tone: "sage" },
  past: { label: "Past", tone: "neutral" },
  undated: { label: "Dates not set", tone: "warn" },
};

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ q?: string; phase?: string }> }) {
  const user = await requireUser();
  const { q = "", phase = "all" } = await searchParams;
  const all = await listTrips(user.id);
  const trips = await listTrips(user.id, { q, phase });
  const invites = await listPendingInvitations(user.id);
  return (
    <>
      <AppHeader user={user} current="trips" />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <PageHeader title="My trips" subtitle={all.length ? `${all.length} trip${all.length === 1 ? "" : "s"} you own or were invited to` : "Only trips you own or were invited to appear here."} actions={<><LinkButton href="/plans">Upgrade to Premium</LinkButton><LinkButton href="/trips/new" variant="primary">+ Plan a new trip</LinkButton></>} />
        <PendingInvites invites={invites} />
        {all.length > 0 && (
          <form role="search" className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center" action="/trips">
            <label htmlFor="q" className="sr-only">Search trips</label>
            <input id="q" name="q" defaultValue={q} placeholder="Search by trip, place or traveler" className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 sm:max-w-xs" />
            <input type="hidden" name="phase" value={phase} />
            <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Filter trips">
              {FILTERS.map(([key, label]) => (
                <Link key={key} href={`/trips?phase=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={phase === key ? "page" : undefined} className={cx("min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium", phase === key ? "bg-ink text-bg" : "bg-surface text-muted border border-line hover:text-ink")}>
                  {label}
                </Link>
              ))}
            </div>
          </form>
        )}
        {all.length === 0 ? (
          <EmptyState title="Where to next?" action={<><LinkButton href="/trips/new" variant="primary">Plan your first trip</LinkButton><LinkButton href="/examples/lisbon-porto">Browse the example</LinkButton></>}>
            Start with just a name and a destination — you can fill in the details and plan with AI whenever you're ready. If someone invited you, open their invitation link while signed in.
          </EmptyState>
        ) : trips.length === 0 ? (
          <EmptyState title="No trips match" action={<LinkButton href="/trips">Clear filters</LinkButton>}>Try a different search or filter.</EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((t) => (
              <li key={t.id}>
                <TripTile trip={t} />
              </li>
            ))}
          </ul>
        )}

        <section aria-labelledby="examples" className="mt-14">
          <h2 id="examples" className="font-display text-xl font-semibold">Example trips</h2>
          <p className="mt-1 text-sm text-muted">Read-only samples written by the Tripanize team — they're not part of your trips. Save a copy to make one yours.</p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EXAMPLES.map((e) => (
              <li key={e.slug}>
                <Link href={`/examples/${e.slug}`} className="group block overflow-hidden rounded-2xl border border-line bg-surface">
                  <div className="relative h-28" style={{ background: e.image }}>
                    <Badge tone="warn" className="absolute left-3 top-3">Example</Badge>
                  </div>
                  <div className="p-4">
                    <p className="font-display text-lg font-semibold group-hover:underline">{e.name}</p>
                    <p className="mt-1 text-sm text-muted">{e.summary}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}

function TripTile({ trip }: { trip: TripCard }) {
  const days = tripLength(trip.startDate, trip.endDate);
  const p = PHASE[trip.phase];
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative h-36 brand-backdrop">
        {trip.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={trip.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
        <Badge tone={p.tone} className="absolute left-3 top-3 shadow-sm">{p.label}</Badge>
        {!trip.imageUrl && <CardPlace destinations={trip.destinations} fallback={trip.name} />}
        {trip.imageCredit && <span className="absolute bottom-1 right-2 text-[10px] text-white/90 drop-shadow">{trip.imageCredit}</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-lg font-semibold leading-tight">{trip.name}</h3>
        <p className="mt-1 text-sm text-muted">{trip.destinations.length ? trip.destinations.join(" → ") : "No destination yet"}</p>
        <p className="mt-1 text-sm">{formatDateRange(trip.startDate, trip.endDate)}{days ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}</p>
        <p className="mt-1 text-sm text-muted">{trip.travelers.join(", ")}</p>
        <div className="mt-auto pt-4">
          <LinkButton href={`/trips/${trip.id}/itinerary`} variant="secondary" className="w-full" aria-label={`Open ${trip.name}`}>Open trip</LinkButton>
          <Link href={`/trips/${trip.id}/premium`} className="mt-2 flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-accent-ink hover:bg-accent-soft" aria-label={`Premium options for ${trip.name}`}>Premium options</Link>
        </div>
      </div>
    </article>
  );
}

// Destination city names on the card banner: "Corfu", "Lisbon → Porto" (anything after a comma is dropped).
function CardPlace({ destinations, fallback }: { destinations: string[]; fallback: string }) {
  const names = destinations.map((d) => d.split(",")[0].trim()).filter(Boolean);
  const label = names.length ? (names.length > 3 ? `${names[0]} → … → ${names[names.length - 1]}` : names.join(" → ")) : fallback;
  return (
    <span className={cx("absolute inset-x-4 bottom-3 line-clamp-2 font-display font-semibold leading-tight text-white [overflow-wrap:anywhere] [text-shadow:0_1px_8px_rgba(0,0,0,.25)]", label.length > 22 ? "text-2xl" : label.length > 12 ? "text-3xl" : "text-4xl")}>
      {label}
    </span>
  );
}
