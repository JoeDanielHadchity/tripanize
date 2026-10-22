import { LinkButton, Notice, PageHeader } from "./ui";
import { PREMIUM_FEATURES, type PremiumFeature } from "@/lib/plans";

export function PremiumRequired({ feature }: { feature: PremiumFeature }) {
  return <>
    <PageHeader title={PREMIUM_FEATURES[feature]} />
    <Notice tone="accent" title="Included with Premium">
      <p>The trip organizer can unlock this feature for everyone in the trip. Your saved trip information is kept.</p>
      <LinkButton href="/plans" className="mt-3" variant="primary">See Normal and Premium</LinkButton>
    </Notice>
  </>;
}
