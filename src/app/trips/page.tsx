import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { listTrips, type TripCard } from "@/server/trips/service";
import { AppHeader } from "@/components/shell";
import { Badge, EmptyState, LinkButton, Notice, PageHeader, cx } from "@/components/ui";
import { formatDateRange, tripLength } from "@/lib/dates";
import { EXAMPLES } from "@/server/examples/data";
import { listPendingInvitations } from "@/server/invitations/service";
import { PendingInvites } from "@/components/pending-invites";
import { userTrialAccess } from "@/server/admin/trials";
import { TrialAccessBanner } from "@/components/trial-access";
import { TripCoverPhoto } from "@/components/trip-cover-photo";

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

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ q?: string; phase?: string; selected?: string }> }) {
  const user = await requireUser();
  const { q = "", phase = "all", selected } = await searchParams;
  const all = await listTrips(user.id);
  const trips = await listTrips(user.id, { q, phase });
  const selectedTrip = all.find(t => t.id === selected);
  if (selectedTrip) trips.sort((a, b) => Number(b.id === selectedTrip.id) - Number(a.id === selectedTrip.id));
  const invites = await listPendingInvitations(user.id);
  const trial = await userTrialAccess(user.id);
  return (
    <>
      <AppHeader user={user} current="trips" />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <PageHeader title="My trips"  actions={<><LinkButton href="/destinations">Find a destination</LinkButton><LinkButton href="/plans">Upgrade to Premium</LinkButton><LinkButton href="/trips/new" variant="primary">+ Create a trip</LinkButton></>} />
        {selectedTrip && <Notice tone="accent" className="mb-5">Your chosen destination is saved in <strong>{selectedTrip.name}</strong>. Continue planning from your trip below.</Notice>}
        <PendingInvites invites={invites} />
        <TrialAccessBanner access={trial} tripId={selectedTrip?.id} canActivate={selectedTrip?.role === "OWNER"} />
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
            Create a trip or find a destination.
          </EmptyState>
        ) : trips.length === 0 ? (
          <EmptyState title="No trips match" action={<LinkButton href="/trips">Clear filters</LinkButton>}>Try a different search or filter.</EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((t) => (
              <li key={t.id}>
                <TripTile trip={t} selected={t.id === selectedTrip?.id} />
              </li>
            ))}
          </ul>
        )}

        <section aria-labelledby="examples" className="mt-14">
          <h2 id="examples" className="font-display text-xl font-semibold">Example trips</h2>
          <p className="mt-1 text-sm text-muted">Copy an example to start planning.</p>
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

function TripTile({ trip, selected = false }: { trip: TripCard; selected?: boolean }) {
  const days = tripLength(trip.startDate, trip.endDate);
  const p = PHASE[trip.phase];
  return (
    <article className={cx("flex h-full flex-col overflow-hidden rounded-2xl border bg-surface", selected ? "border-accent ring-2 ring-accent/25" : "border-line")}>
      <div className="relative h-36 brand-backdrop">
        <CardPlace destinations={trip.destinations} fallback={trip.name} />
        {trip.destinations.length > 0 && <TripCoverPhoto key={`${trip.destinations.join("|")}:${trip.updatedAt.toISOString()}`} tripId={trip.id} destination={trip.destinations[0]} initialImage={trip.coverImage} />}
        <Badge tone={p.tone} className="absolute left-3 top-3 shadow-sm">{p.label}</Badge>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-lg font-semibold leading-tight">{trip.name}</h3>
        <p className="mt-1 text-sm text-muted">{trip.destinations.length ? trip.destinations.join(" → ") : "No destination yet"}</p>
        <p className="mt-1 text-sm">{formatDateRange(trip.startDate, trip.endDate)}{days ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}</p>
        <p className="mt-1 text-sm text-muted">{trip.travelers.join(", ")}</p>
        <div className="mt-auto pt-4">
          <LinkButton href={`/trips/${trip.id}/${trip.role !== "OWNER" || trip.onboardingStage === "COMPLETE" ? "itinerary" : trip.onboardingStage === "PLAN" ? "premium" : "onboarding"}`} variant="secondary" className="w-full" aria-label={`Open ${trip.name}`}>{trip.role === "OWNER" && trip.onboardingStage !== "COMPLETE" ? "Continue setup" : "Open trip"}</LinkButton>
          <Link href={`/trips/${trip.id}/premium`} className="mt-2 flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-accent-ink hover:bg-accent-soft" aria-label={`Features and checkout for ${trip.name}`}>Normal & Premium</Link>
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
