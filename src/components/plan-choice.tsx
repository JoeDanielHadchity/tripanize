import Link from "next/link";
import { Badge, Card } from "./ui";
import { NORMAL_AI_DAYS } from "@/lib/plans";
import { PREMIUM_CREDIT_PRICE } from "@/lib/credits";

/** First step of New trip: Free or Premium (paid, or from credits the person already has). */
export function PlanChoice({ credits }: { credits: { active: boolean; balance: number } }) {
  const enough = credits.active && credits.balance >= PREMIUM_CREDIT_PRICE;
  const option = "flex h-full flex-col gap-3 rounded-2xl border-2 border-line p-5 text-left transition hover:border-accent focus-visible:border-accent";
  return <section aria-labelledby="plan-choice-h">
    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-ink">New trip</p>
    <h1 id="plan-choice-h" className="font-display text-3xl font-extrabold">Free or Premium?</h1>
    <p className="mt-2 text-muted">Choose how you want to plan this trip. You can upgrade a free trip any time later.</p>
    <ul className="mt-6 grid gap-4 md:grid-cols-3">
      <li><Link href="/trips/new?plan=free" className={option}>
        <span className="flex items-center justify-between"><span className="font-display text-xl font-bold">Free</span><span className="font-bold">$0</span></span>
        <ul className="flex-1 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>AI plans your first {NORMAL_AI_DAYS} days</li>
          <li>Plan and edit every day yourself</li>
          <li>Invite your group: editors, viewers and voting</li>
          <li>Add bookings and packing by hand</li>
        </ul>
        <span className="font-semibold text-accent-ink">Start free →</span>
      </Link></li>
      <li><Link href="/trips/new?plan=premium" className={`${option} border-accent`}>
        <span className="flex items-center justify-between"><span className="font-display text-xl font-bold">Premium</span><span className="font-bold">$15 per trip</span></span>
        <Badge tone="accent" className="self-start">One payment for the whole group</Badge>
        <ul className="flex-1 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>AI plans every day of your trip</li>
          <li>Events, the AI assistant and stop alternatives</li>
          <li>Shared expenses, receipt scanning, chat and member locations</li>
          <li>Packing suggestions for your weather and plans</li>
          <li>Includes AI credits for this trip; bigger credit bundles are offered at checkout</li>
        </ul>
        <span className="font-semibold text-accent-ink">Choose Premium →</span>
      </Link></li>
      {credits.active && <li>{enough
        ? <Link href="/trips/new?plan=credits" className={option}>
            <span className="flex items-center justify-between"><span className="font-display text-xl font-bold">Premium with your credits</span></span>
            <span className="text-sm font-bold">{PREMIUM_CREDIT_PRICE} credits · you have {credits.balance}</span>
            <p className="flex-1 text-sm text-muted">Everything in Premium, with no payment. The {PREMIUM_CREDIT_PRICE} credits move to the new trip and pay for its AI planning.</p>
            <span className="font-semibold text-accent-ink">Use my credits →</span>
          </Link>
        : <div className={`${option} opacity-75 hover:border-line`} aria-disabled="true">
            <span className="font-display text-xl font-bold">Premium with your credits</span>
            <span className="text-sm font-bold">{PREMIUM_CREDIT_PRICE} credits · you have {credits.balance}</span>
            <p className="flex-1 text-sm text-muted">Everything in Premium, with no payment, once you have {PREMIUM_CREDIT_PRICE} credits.</p>
            <Link href="/account/credits#top-up" className="font-semibold text-accent-ink underline">Get more credits</Link>
          </div>}</li>}
    </ul>
  </section>;
}
