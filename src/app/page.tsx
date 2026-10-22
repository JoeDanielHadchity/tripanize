import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { Logo, SettingsLink } from "@/components/shell";
import { LinkButton } from "@/components/ui";

const FEATURES = [
  ["Plan with AI", "Describe the trip and get a realistic day-by-day plan built from your dates, places, pace and commitments — then accept all of it or just the days you like."],
  ["Today, at a glance", "On the road, see only what's next: the stop, directions in your maps app, bookings, weather and a quick Plan B."],
  ["Shared, not chaotic", "Invite companions as collaborators or viewers. Bookings, expenses and events stay in one place for everyone."],
  ["Fair expenses", "Split any way you like, settle up, and see who paid what — in every currency, without rounding surprises."],
] as const;

export default async function Home() {
  if (await getSessionUser()) redirect("/trips");
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <nav aria-label="Account" className="flex gap-2">
          <LinkButton href="/plans" variant="ghost">Pricing</LinkButton>
          <SettingsLink />
          <LinkButton href="/sign-in" variant="ghost">Sign in</LinkButton>
          <LinkButton href="/sign-up" variant="primary">Get started</LinkButton>
        </nav>
      </header>
      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 lg:grid-cols-2 lg:pt-16">
          <div>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              A little less planning.<br />
              <span className="text-accent-ink">A lot more going.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted">Tripanize is a calm travel workspace for you and the people you travel with: an AI-drafted itinerary you stay in control of, plus bookings, expenses, packing and events — on your phone when it matters.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/sign-up" variant="primary" className="px-6">Plan a trip</LinkButton>
              <LinkButton href="/examples/lisbon-porto">See an example trip</LinkButton>
            </div>
          </div>
          <div aria-hidden className="relative aspect-[4/3] overflow-hidden rounded-3xl brand-backdrop shadow-xl">
            <div className="absolute inset-x-5 bottom-5 rounded-2xl bg-surface/95 p-4 text-ink shadow-lg">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Next stop · 10:30</p>
              <p className="mt-1 font-display text-xl">Jerónimos Monastery</p>
              <p className="text-sm text-muted">12 min walk · Booked · Plan B: MAAT if it rains</p>
            </div>
          </div>
        </section>
        <section className="border-t border-line bg-surface/60">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([t, d]) => (
              <div key={t}>
                <h2 className="font-display text-lg font-semibold">{t}</h2>
                <p className="mt-2 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
