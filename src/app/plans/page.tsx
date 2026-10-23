import type { Metadata } from "next";
import { getSessionUser } from "@/server/auth/session";
import { AppHeader, Logo } from "@/components/shell";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { PlanComparison } from "@/components/plan-comparison";
export const metadata: Metadata = { title: "Normal or Premium — $15 per trip" };
export default async function PlansPage() {
  const user = await getSessionUser(); const create = user ? "/trips/new" : "/sign-up";
  return <>{user ? <AppHeader user={user} /> : <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4"><Logo /><LinkButton href="/sign-in">Sign in</LinkButton></header>}
    <main id="main" className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-8">
      <PageHeader title="One trip. One simple choice." subtitle="Start with Normal for free, or get a complete Premium trip for $15. Any group size." />
      <div className="grid gap-4 sm:grid-cols-2"><Card><Badge>Normal · Free</Badge><h2 className="mt-4 font-display text-3xl font-semibold">A little help to begin</h2><p className="mt-3 text-sm text-muted">An AI itinerary for the first 2 days per trip. Plan the remaining days manually, add your own bookings and build a packing checklist.</p><LinkButton href={create} className="mt-5">Create a trip</LinkButton></Card><Card className="border-accent bg-accent-soft/30"><Badge tone="accent">Premium</Badge><h2 className="mt-4 font-display text-4xl font-semibold">$15 <span className="font-sans text-sm font-normal text-muted">USD / trip</span></h2><p className="mt-3 text-sm text-muted">Pay once for your whole group. Get tailored questions, a full itinerary, researched events with booking links, customized packing, expenses, chat, optional locations and the AI assistant.</p><LinkButton href={create} variant="primary" className="mt-5">Create a trip & choose your plan</LinkButton></Card></div>
      <PlanComparison />
      <Card><h2 className="font-display text-xl font-semibold">Your organizer stays in control</h2><p className="mt-2 text-sm text-muted">One organizer manages the trip and assigns editors and viewers. Editors can change shared trip information. Viewers can see the shared plan without editing it. Each person controls their own optional location sharing and personal packing list.</p></Card>
      <p className="text-sm text-muted">No subscription or automatic renewal. Applicable tax is displayed before payment. You can upgrade a Normal trip at any time. AI requests have usage limits. Suggested bookings are not confirmed reservations.</p>
    </main></>;
}
