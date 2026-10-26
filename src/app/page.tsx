import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { Logo, SettingsLink } from "@/components/shell";
import { LinkButton, cx } from "@/components/ui";

const FEATURES = [
  ["A plan that fits you", "Choose Normal for two AI-planned days, or Premium for a complete trip built from your dates, travel details and tailored questions."],
  ["Events, already connected", "Premium researches events while planning your trip and keeps their booking suggestions linked. Remove an event and its suggestion disappears too."],
  ["Shared, not chaotic", "One organizer invites companions as editors or viewers. Bookings, expenses and events stay in one place for everyone."],
  ["Fair expenses", "Split any way you like, settle up, and see who paid what — in every currency, without rounding surprises."],
] as const;

// Each feature is a luggage tag; colors and strings vary a little so they feel hand-made.
const TAGS = [
  { bg: "bg-accent-soft", radius: "rounded-[26px_22px_28px_24px]", string: "M20 40 C 12 28, 28 16, 18 2" },
  { bg: "bg-sage-soft", radius: "rounded-[22px_28px_24px_26px]", string: "M20 40 C 28 26, 12 14, 22 2" },
  { bg: "bg-warn-soft", radius: "rounded-[28px_24px_22px_26px]", string: "M20 40 C 10 30, 26 18, 16 2" },
  { bg: "bg-surface-2", radius: "rounded-[24px_26px_28px_22px]", string: "M20 40 C 26 30, 14 16, 24 2" },
] as const;

export default async function Home() {
  if (await getSessionUser()) redirect("/start");
  return (
    <div className="min-h-dvh overflow-x-clip">
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
        {/* Hero: a boarding pass with a window seat */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 lg:pt-14">
          <div className="relative lg:-rotate-[0.6deg]">
            <span aria-hidden className="tape absolute -top-3 left-10 z-10 h-7 w-28 -rotate-6 sm:left-20" />
            <span aria-hidden className="tape absolute -top-3 right-10 z-10 h-7 w-24 rotate-[5deg] sm:right-28" />
            <div className="sketch-card paper-shadow flex flex-col border-2 border-ink bg-surface lg:flex-row">
              <PlaneWindow />
              <div className="min-w-0 flex-1 px-6 pb-8 pt-6 sm:px-10 lg:py-12 lg:pl-4">
                <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                  A little less planning.<br />
                  <span className="relative inline-block text-accent-ink">
                    <i>A lot more going.</i>
                    <svg aria-hidden viewBox="0 0 240 16" preserveAspectRatio="none" className="absolute -bottom-2.5 left-0 h-4 w-full stroke-sage" fill="none">
                      <path d="M3 10 C 40 3, 80 14, 120 7 S 200 13, 237 5" strokeWidth="3.5" strokeLinecap="round" />
                    </svg>
                  </span>
                </h1>
                <p className="mt-7 max-w-lg text-lg text-muted">Tripanize is a calm travel workspace for you and the people you travel with: an AI-drafted itinerary you stay in control of, with bookings and packing in one place. Premium adds the complete AI plan, events, expenses and group tools.</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <LinkButton href="/sign-up" variant="primary" className="px-6">Create a trip</LinkButton>
                  <LinkButton href="/examples/lisbon-porto" className="sketch-alt">See an example trip</LinkButton>
                </div>
              </div>
              <TicketStub />
            </div>
          </div>
        </section>

        {/* Normal or Premium, as a fare ticket */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="sketch-card paper-shadow flex flex-col border-2 border-ink bg-surface sm:flex-row lg:rotate-[0.4deg]">
            <div className="min-w-0 flex-1 p-6 sm:p-8">
              <p className="font-hand text-2xl leading-none text-accent-ink">Normal or Premium</p>
              <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Start free. Get the whole trip for $15.</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted">Create your trip, compare the plans, then tell us where you are going. Premium includes every traveler, whatever your group size. One-time payment, plus applicable tax.</p>
            </div>
            <div className="relative flex flex-col items-center justify-center gap-3 border-t-2 border-dashed border-ink/60 p-6 sm:w-64 sm:border-l-2 sm:border-t-0">
              <Notches from="sm" />
              <PaperPlane className="h-9 w-9 -rotate-6 text-accent-ink" />
              <LinkButton href="/plans" variant="primary">Compare the benefits</LinkButton>
            </div>
          </div>
        </section>

        {/* Features, as luggage tags */}
        <section className="border-t-2 border-dashed border-line">
          <div className="mx-auto grid max-w-6xl gap-x-6 gap-y-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([t, d], i) => (
              <div key={t} className="tp-sway relative pt-9" style={{ animationDelay: `${-i * 1.7}s` }}>
                <svg aria-hidden viewBox="0 0 40 40" className="absolute left-1/2 top-0 h-10 w-10 -translate-x-1/2 stroke-ink" fill="none" strokeWidth="1.8" strokeLinecap="round">
                  <path d={TAGS[i].string} />
                </svg>
                <div className={cx("relative h-full border-2 border-ink px-6 pb-6 pt-10", TAGS[i].bg, TAGS[i].radius)}>
                  <span aria-hidden className="absolute left-1/2 top-3.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-ink bg-bg" />
                  <h2 className="font-display text-xl font-semibold">{t}</h2>
                  <p className="mt-2 text-sm text-muted">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

/** Decorative airplane window with drifting clouds and a slowly breathing sun. */
function PlaneWindow() {
  return (
    <div aria-hidden className="flex items-center justify-center px-6 pt-8 lg:py-8 lg:pl-8 lg:pr-2">
      <div className="h-60 w-44 rounded-[130px_120px_126px_132px] border-[2.5px] border-ink bg-surface-2 p-3 sm:h-72 sm:w-52 lg:h-[21rem] lg:w-60">
        <div className="relative h-full w-full overflow-hidden rounded-[116px_110px_112px_118px] border-2 border-ink bg-[var(--sky)]">
          <svg viewBox="0 0 222 318" preserveAspectRatio="xMidYMid slice" className="block h-full w-full stroke-ink" strokeWidth="2">
            <circle className="tp-breathe fill-[var(--sun)]" cx="140" cy="190" r="30" />
            <g className="tp-drift-slow fill-[var(--cloud)]" strokeWidth="1.8">
              <path d="M30 96 c0-10 14-14 20-8 c4-10 22-10 24 2 c10 0 12 12 2 14 h-44 c-8 0-8-8-2-8z" />
              <path d="M200 70 c0-8 12-12 16-6 c4-8 18-8 20 2 c8 0 10 10 2 12 h-36 c-6 0-6-8-2-8z" />
              <path d="M330 110 c0-10 14-14 20-8 c4-10 22-10 24 2 c10 0 12 12 2 14 h-44 c-8 0-8-8-2-8z" />
            </g>
            <path className="fill-[var(--cloud)]" d="M-4 226 C 30 206, 60 228, 96 214 S 160 222, 226 210 V318 H-4Z" />
            <g className="tp-drift fill-surface" strokeWidth="1.6">
              <path d="M0 258 C 40 240, 80 262, 120 248 S 200 258, 260 244 S 360 256, 420 246 V318 H0Z" />
            </g>
            <path className="fill-[var(--cloud)]" d="M-4 292 C 50 276, 100 296, 150 284 S 210 290, 226 284 V318 H-4Z" />
          </svg>
          <div className="absolute inset-x-0 top-0 h-8 border-b-2 border-ink bg-surface" />
        </div>
      </div>
    </div>
  );
}

/** The ticket stub holds the same "next stop" example the homepage has always shown. */
function TicketStub() {
  return (
    <div aria-hidden className="relative flex flex-col gap-4 border-t-2 border-dashed border-ink/60 px-6 py-7 lg:w-72 lg:border-l-2 lg:border-t-0 lg:px-8 lg:py-10">
      <Notches from="lg" />
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-4xl leading-none">LIS</span>
        <svg viewBox="0 0 40 24" className="h-6 w-10 stroke-accent-ink" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 18 C 10 6, 20 20, 30 8" />
          <path d="M24 6 L31 7 L30 14" />
        </svg>
        <span className="font-display text-4xl leading-none">OPO</span>
      </div>
      <div className="border-t-[1.5px] border-line pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Next stop · 10:30</p>
        <p className="mt-1 font-display text-2xl">Jerónimos Monastery</p>
        <p className="mt-1 font-hand text-xl leading-snug">12 min walk · Booked · Plan B: MAAT if it rains</p>
      </div>
      <svg viewBox="0 0 190 36" preserveAspectRatio="none" className="mt-auto h-9 w-full fill-ink opacity-80">
        {[0, 7, 12, 21, 26, 33, 43, 48, 55, 60, 69, 76, 81, 89, 94, 104, 111, 116, 124, 129, 136, 145, 150, 157, 162, 172, 179, 184].map((x, i) => (
          <rect key={x} x={x} y="0" width={[3, 1.5, 5, 1.5, 3, 6, 1.5][i % 7]} height="36" />
        ))}
      </svg>
    </div>
  );
}

/** Half-circle cut-outs where a ticket tears off; shown only when the stub sits beside the ticket. */
function Notches({ from }: { from: "sm" | "lg" }) {
  const show = from === "sm" ? "sm:block" : "lg:block";
  return (
    <>
      <span aria-hidden className={cx("absolute -left-[18px] -top-[18px] hidden h-[33px] w-[33px] rounded-full border-b-2 border-ink bg-bg", show)} />
      <span aria-hidden className={cx("absolute -bottom-[18px] -left-[18px] hidden h-[33px] w-[33px] rounded-full border-t-2 border-ink bg-bg", show)} />
    </>
  );
}

function PaperPlane({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 34 34" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17 L30 5 L21 30 L16 19 Z" />
      <path d="M16 19 L30 5" />
    </svg>
  );
}
