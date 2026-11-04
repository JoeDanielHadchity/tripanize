import Link from "next/link";
import { LinkButton } from "@/components/ui";
import { PremiumStar } from "@/components/premium-star";
import { planPrice } from "@/lib/credits";

/**
 * Shown once, right after setup plans a free trip's first days: the moment the rest is worth paying for.
 * On credits, the rest of the days cost credits; otherwise Premium plans them, for one payment per trip.
 */
export function FirstPlanOffer({ tripId, planned, total, credits = false }: { tripId: string; planned: number; total: number; credits?: boolean }) {
  // Without any planned day (say the AI was unavailable), talk about the whole trip rather than "the rest".
  const rest = planned > 0 ? Math.max(0, total - planned) : 0;
  const heading = <>{planned > 0 ? `${planned} day${planned === 1 ? "" : "s"} planned.` : "Your trip is set up."}{rest > 0 ? ` Want the other ${rest} too?` : ""}</>;
  return (
    <section aria-labelledby="first-plan-offer-h" className="night-card mb-5 rounded-[28px] bg-night p-6 text-night-ink sm:p-7">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-night-accent">Your first plan is ready</p>
      <h2 id="first-plan-offer-h" className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{heading}</h2>
      {credits ? (
        <p className="mt-2 max-w-2xl text-sm text-night-muted">
          Plan {rest > 0 ? `the other ${rest} days` : "your days"} with AI for {planPrice(rest > 0 ? rest : total)} credits, or keep planning by hand for free. Bundles from $15 also unlock Premium for this trip: shared expenses, group chat and the AI assistant.
        </p>
      ) : (
        <p className="mt-2 max-w-2xl text-sm text-night-muted">
          Premium plans {rest > 0 ? "every remaining day" : "all your days"} with AI, and adds events, packing made for your trip, shared expenses, group chat and the AI assistant. One payment of $15 for the whole trip, everyone included.
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {credits
          ? <LinkButton href={`/trips/${tripId}/plan`} variant="primary">{rest > 0 ? `Plan the other ${rest} days · ${planPrice(rest)} credits` : `Plan with AI · ${planPrice(total)} credits`}</LinkButton>
          : <LinkButton href={`/trips/${tripId}/premium`} variant="primary" className="gap-2"><PremiumStar className="text-current" /> {rest > 0 ? "Plan the rest with Premium · $15" : "Plan it with Premium · $15"}</LinkButton>}
        <Link href={`/trips/${tripId}/itinerary`} className="inline-flex min-h-11 items-center text-sm font-bold text-night-accent underline">Keep planning for free</Link>
      </div>
    </section>
  );
}
