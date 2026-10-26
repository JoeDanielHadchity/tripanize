import type { Metadata } from "next";
import { getSessionUser } from "@/server/auth/session";
import { AppHeader, Logo } from "@/components/shell";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { PlanComparison } from "@/components/plan-comparison";
import { userTrialAccess } from "@/server/admin/trials";
import { TrialAccessBanner } from "@/components/trial-access";
export const metadata: Metadata = { title: "Normal or Premium — $15 per trip" };
export default async function PlansPage() {
  const user = await getSessionUser(); const create = user ? "/trips/new" : "/sign-up";
  const trial = user ? await userTrialAccess(user.id) : null;
  return <>{user ? <AppHeader user={user} /> : <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4"><Logo /><LinkButton href="/sign-in">Sign in</LinkButton></header>}
    <main id="main" className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-8">
      {trial && <TrialAccessBanner access={trial} />}
      <PageHeader title="Choose your plan" subtitle="Free or $15 per trip, for everyone." />
      <div className="grid gap-4 sm:grid-cols-2"><Card><Badge>Standard · Free</Badge><h2 className="mt-4 font-display text-3xl font-semibold">Standard</h2><p className="mt-3 text-sm text-muted">AI planning for 2 days. Manual itinerary, bookings and packing.</p><LinkButton href={create} className="mt-5">Create a trip</LinkButton></Card><Card className="border-accent bg-accent-soft/30"><Badge tone="accent">Premium</Badge><h2 className="mt-4 font-display text-4xl font-semibold">$15 <span className="font-sans text-sm font-normal text-muted">USD / trip</span></h2><p className="mt-3 text-sm text-muted">Full AI planning and all trip tools. Every traveler included.</p><LinkButton href={create} variant="primary" className="mt-5">Create a trip</LinkButton></Card></div>
      <PlanComparison />

      <p className="text-sm text-muted">No subscription or automatic renewal. Applicable tax is displayed before payment. You can upgrade a Normal trip at any time. AI requests have usage limits. Suggested bookings are not confirmed reservations.</p>
    </main></>;
}
