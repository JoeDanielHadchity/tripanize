import { LinkButton, Notice, PageHeader } from "./ui";
import { PREMIUM_FEATURES, type PremiumFeature } from "@/lib/plans";
import { PremiumStar } from "./premium-star";

export function PremiumRequired({ feature, tripId }: { feature: PremiumFeature; tripId: string }) {
  return <>
    <PageHeader title={<span className="inline-flex items-center gap-2">{PREMIUM_FEATURES[feature]} <PremiumStar /></span>} />
    <Notice tone="accent" title="Included with Premium · $15 per trip">
      <p>$15 unlocks Premium for this trip and every member.</p>
      <LinkButton href={`/trips/${tripId}/premium#feature-${feature}`} className="mt-3" variant="primary">Upgrade to Premium · $15</LinkButton>
    </Notice>
  </>;
}
