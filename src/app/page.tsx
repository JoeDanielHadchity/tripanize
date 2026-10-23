import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { Logo, SettingsLink } from "@/components/shell";
import { LinkButton } from "@/components/ui";

const FEATURES = [
  ["A plan that fits you", "Choose Normal for two AI-planned days, or Premium for a complete trip built from your dates, travel details and tailored questions."],
  ["Events, already connected", "Premium researches events while planning your trip and keeps their booking suggestions linked. Remove an event and its suggestion disappears too."],
  ["Shared, not chaotic", "One organizer invites companions as editors or viewers. Bookings, expenses and events stay in one place for everyone."],
  ["Fair expenses", "Split any way you like, settle up, and see who paid what — in every currency, without rounding surprises."],
] as const;

export default async function Home() {
  if (await getSessionUser()) redirect("/start");
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
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
            <p className="mt-5 max-w-lg text-lg text-muted">Tripanize is a calm travel workspace for you and the people you travel with: an AI-drafted itinerary you stay in control of, with bookings and packing in one place. Premium adds the complete AI plan, events, expenses and group tools.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/sign-up" variant="primary" className="px-6">Create a trip</LinkButton>
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
        <section className="mx-auto max-w-6xl px-4 pb-14"><div className="grid gap-4 rounded-3xl border border-accent/30 bg-accent-soft/30 p-6 sm:grid-cols-[1fr_auto]"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent-ink">Normal or Premium</p><h2 className="mt-2 font-display text-2xl font-semibold">Start free. Get the whole trip for $15.</h2><p className="mt-2 max-w-2xl text-sm text-muted">Create your trip, compare the plans, then tell us where you are going. Premium includes every traveler, whatever your group size. One-time payment, plus applicable tax.</p></div><LinkButton href="/plans" variant="primary" className="self-center">Compare the benefits</LinkButton></div></section>
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
