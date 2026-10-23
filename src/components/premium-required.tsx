import { LinkButton, Notice, PageHeader } from "./ui";
import { PREMIUM_FEATURES, type PremiumFeature } from "@/lib/plans";
import { PremiumStar } from "./premium-star";

export function PremiumRequired({ feature, tripId }: { feature: PremiumFeature; tripId: string }) {
  return <>
    <PageHeader title={<span className="inline-flex items-center gap-2">{PREMIUM_FEATURES[feature]} <PremiumStar /></span>} />
    <Notice tone="accent" title="Choose this Premium feature">
      <p>Add this to your trip's feature selection and review the total before paying. One Premium payment unlocks all starred features for everyone in the trip. Your saved information is kept.</p>
      <LinkButton href={`/trips/${tripId}/premium#feature-${feature}`} className="mt-3" variant="primary">Choose features & checkout</LinkButton>
    </Notice>
  </>;
}
