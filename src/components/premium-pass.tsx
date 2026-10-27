import type { ReactNode } from "react";
import { PREMIUM_PRICE_MINOR, premiumPrice } from "@/lib/plans";
import { PremiumStar } from "./premium-star";

type PassProps = {
  premiumAction: ReactNode;
  standardAction: ReactNode;
  price?: string;
  priceLabel?: string;
  priceIsStatus?: boolean;
  priceNote?: string;
  premiumFooter?: string;
  standardNote?: string;
  groupNote?: string;
};

// Use the same stroke icons as the trip navigation.
const ICONS = {
  plan: "M4 6h16M4 12h10M4 18h7",
  events: "M5 5h14v14H5zM5 9h14M9 3v4m6-4v4",
  packing: "M6 8h12l-1 12H7zM9 8V6a3 3 0 016 0v2",
  expenses: "M4 7h16v10H4zM8 12h.01M16 12h.01M12 10a2 2 0 110 4 2 2 0 010-4z",
};
function PassIcon({ name }: { name: keyof typeof ICONS }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>;
}
function Check() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>;
}

/** Shared presentation only. Checkout, trial activation and access stay with callers. */
export function PremiumPass({ premiumAction, standardAction, price = premiumPrice(PREMIUM_PRICE_MINOR), priceLabel = "USD / trip", priceIsStatus = false, priceNote = "One payment for the whole group.", premiumFooter = "Any group size. No subscription.", standardNote = "Upgrade this trip anytime.", groupNote = "One upgrade for everyone on this trip." }: PassProps) {
  return <section className="premium-pass" aria-labelledby="premium-pass-title">
    <div className="premium-pass-hero">
      <div className="premium-pass-intro"><p className="premium-pass-eyebrow">Choose your plan</p><h1 id="premium-pass-title">Your trip,<br />thoughtfully organized.</h1><p className="premium-pass-lead">A full itinerary, places you&apos;ll enjoy, and shared tools to keep your group together.</p><p className="premium-pass-group">{groupNote}</p></div>
      <aside className="premium-pass-ticket" aria-label="Premium trip access">
        <div className="premium-pass-ticket-heading"><h2>Premium</h2><span aria-hidden="true"><PremiumStar className="text-current" /></span></div>
        <div className={`premium-pass-price${priceIsStatus ? " premium-pass-price-status" : ""}`}><strong>{price}</strong><span>{priceLabel}</span></div>
        <p className="premium-pass-price-note">{priceNote}</p>
        <div className="premium-pass-divider" aria-hidden="true" />
        <div className="premium-pass-action">{premiumAction}</div>
        <p className="premium-pass-ticket-foot">{premiumFooter}</p>
      </aside>
    </div>
    <div className="premium-pass-section-heading"><h2>Help for every part of the trip.</h2><p>Explore what&apos;s included</p></div>
    <div className="premium-pass-journey">
      <details className="premium-pass-step" id="feature-advancedPlanning" open>
        <summary><span className="premium-pass-step-icon"><PassIcon name="plan" /></span><span className="premium-pass-step-title"><small>Plan it</small><strong>Your days, sorted.</strong></span><span className="premium-pass-results"><span><Check />AI planning for every trip day</span><span><Check />An assistant to adjust the plan</span></span><svg className="premium-pass-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 9 6 6 6-6" /></svg></summary>
        <div className="premium-pass-detail"><p>Your interests, dates and budget shape the itinerary. Ask to move a day or swap an activity, then review the changes before applying.</p><div className="premium-pass-example" id="feature-assistant"><strong>“Move the museum to tomorrow.”</strong><span>Your assistant prepares an update for you to review.</span></div></div>
      </details>
      <details className="premium-pass-step" id="feature-events">
        <summary><span className="premium-pass-step-icon"><PassIcon name="events" /></span><span className="premium-pass-step-title"><small>Explore it</small><strong>Find your kind of places.</strong></span><span className="premium-pass-results"><span><Check />Restaurant options for each meal</span><span><Check />Events with linked booking suggestions</span></span><svg className="premium-pass-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 9 6 6 6-6" /></svg></summary>
        <div className="premium-pass-detail"><p>Food preferences guide your meal suggestions. Discover events matched to your interests and trip dates, with new-event notifications and booking links to explore.</p><div className="premium-pass-example"><strong>Suggestions that fit the trip.</strong><span>Make any reservations directly with the provider.</span></div></div>
      </details>
      <details className="premium-pass-step" id="feature-packing">
        <summary><span className="premium-pass-step-icon"><PassIcon name="packing" /></span><span className="premium-pass-step-title"><small>Enjoy it together</small><strong>Prepared and connected.</strong></span><span className="premium-pass-results"><span><Check />Packing tailored to your trip</span><span id="feature-chat"><Check />Group chat and optional location sharing</span></span><svg className="premium-pass-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 9 6 6 6-6" /></svg></summary>
        <div className="premium-pass-detail"><p>Get a packing list shaped by the weather, season, your preferences and activities. Keep trip conversations together, and share your location whenever you choose.</p><div className="premium-pass-example" id="feature-locations"><strong>Your location, your choice.</strong><span>Every member can turn their own sharing on or off.</span></div></div>
      </details>
      <details className="premium-pass-step" id="feature-expenses">
        <summary><span className="premium-pass-step-icon"><PassIcon name="expenses" /></span><span className="premium-pass-step-title"><small>Keep it clear</small><strong>Shared costs, made clear.</strong></span><span className="premium-pass-results"><span><Check />Track spending and see who owes whom</span><span><Check />Attach receipts and scan the details</span></span><svg className="premium-pass-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 9 6 6 6-6" /></svg></summary>
        <div className="premium-pass-detail"><p>Keep real spending separate from estimates, split expenses across your group and see the balances. Attach receipt photos, images or PDFs, and review AI-extracted details.</p><div className="premium-pass-example"><strong>Everything behind the expense stays together.</strong><span>Record repayments after settling outside the app.</span></div></div>
      </details>
    </div>
    <div className="premium-pass-standard"><div><div className="premium-pass-standard-title"><h2>Standard</h2><strong>Free</strong></div><p>AI for the first 2 days. Add and edit the rest manually, including bookings and packing items. Invite your group and choose who can edit.</p></div><div className="premium-pass-standard-action">{standardAction}<small>{standardNote}</small></div></div>
    <p className="premium-pass-both"><strong>Both plans:</strong> any group size, organizer/editor/viewer roles, manual edits, group voting and booking reminders.</p>
  </section>;
}
