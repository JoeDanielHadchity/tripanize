import { LinkButton, Notice, PageHeader } from "./ui";
import { PREMIUM_FEATURES, type PremiumFeature } from "@/lib/plans";
import { PremiumStar } from "./premium-star";

export function PremiumRequired({ feature, tripId }: { feature: PremiumFeature; tripId: string }) {
  return <>
    <PageHeader title={<span className="inline-flex items-center gap-2">{PREMIUM_FEATURES[feature]} <PremiumStar /></span>} />
    <Notice tone="accent" title="Included with Premium · $15 per trip">
      <p>One $15 payment by the organizer unlocks every Premium feature for this trip, for any group size. You can upgrade whenever you like.</p>
      <LinkButton href={`/trips/${tripId}/premium#feature-${feature}`} className="mt-3" variant="primary">Upgrade to Premium · $15</LinkButton>
    </Notice>
  </>;
}
