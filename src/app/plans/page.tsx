import { publicMetadata, PUBLIC_PAGES } from "@/lib/seo";
import { getSessionUser } from "@/server/auth/session";
import { PublicHeader } from "@/components/public-header";
import { LinkButton } from "@/components/ui";
import { PremiumPass } from "@/components/premium-pass";
import { userTrialAccess } from "@/server/admin/trials";
import { TrialAccessBanner } from "@/components/trial-access";
import { creditsActiveFor, creditsEnabled } from "@/server/credits/service";
export const metadata = publicMetadata("/plans", PUBLIC_PAGES["/plans"]);
export default async function PlansPage() {
  const user = await getSessionUser(); const create = user ? "/trips/new" : "/sign-up";
  const trial = user ? await userTrialAccess(user.id) : null;
  // Mentioned only once credits apply (for everyone at launch, or to a tester before that).
  const credits = creditsEnabled() || (user ? await creditsActiveFor(user.id) : false);
  return <><PublicHeader currentPath="/plans" user={user} />
    <main id="main" className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-8">
      {trial && <TrialAccessBanner access={trial} />}
      <PremiumPass premiumAction={<LinkButton href={create} variant="primary">Create a trip →</LinkButton>} standardAction={<LinkButton href={create}>Start free</LinkButton>} creditsNote={credits ? "Includes 100 AI credits, plenty to plan your whole trip. Top up anytime." : undefined} />

      <p className="text-xs text-muted">AI usage limits apply. Any applicable taxes are shown at checkout. <a href="/terms" className="underline">Terms</a> · <a href="/privacy" className="underline">Privacy</a> · <a href="/refunds" className="underline">Refunds</a></p>
    </main></>;
}
