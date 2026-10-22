import type { Metadata } from "next";
import { getSessionUser } from "@/server/auth/session";
import { getAccountPlan } from "@/server/plans/access";
import { AppHeader, Logo } from "@/components/shell";
import { Badge, Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { PLAN_COMPARISON } from "@/lib/plans";

export const metadata: Metadata = { title: "Normal and Premium" };

export default async function PlansPage() {
  const user = await getSessionUser();
  const plan = user ? await getAccountPlan(user.id) : null;
  return <>
    {user ? <AppHeader user={user} /> : <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4"><Logo /><LinkButton href="/sign-in">Sign in</LinkButton></header>}
    <main id="main" className="mx-auto max-w-3xl px-4 pb-16 pt-8">
      <PageHeader title="Your trip, your way" subtitle="Start with Normal. Bring the whole group together with Premium." />
      {plan?.preview && <Notice tone="accent" className="mb-6">You’re using the Premium preview. Paid subscriptions are not available yet.</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <Badge>Normal</Badge>
          <h2 className="mt-3 font-display text-3xl font-semibold">Free</h2>
          <p className="mt-2 text-sm text-muted">An AI itinerary for your first 3 days per trip, with manual planning for every day.</p>
          <p className="mt-3 text-sm text-muted">Add your own bookings and packing items.</p>
          <LinkButton href={user ? "/trips" : "/sign-up"} className="mt-5">{user ? "Open my trips" : "Start with Normal"}</LinkButton>
        </Card>
        <Card className="border-accent bg-accent-soft/30">
          <Badge tone="accent">Premium</Badge>
          <h2 className="mt-3 font-display text-3xl font-semibold">Plan together</h2>
          <p className="mt-2 text-sm text-muted">AI planning for the whole trip, an AI assistant, expenses, chat, optional member locations and event discovery.</p>
          <p className="mt-3 text-sm font-medium">The organizer subscribes. Everyone in their trips benefits.</p>
          <p className="mt-5 rounded-xl border border-line bg-surface p-3 text-sm">Premium subscriptions are coming soon. Pricing will be shown here before you subscribe.</p>
        </Card>
      </div>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Compare Normal and Premium features</caption>
          <thead className="bg-surface-2"><tr><th scope="col" className="p-4">Feature</th><th scope="col" className="p-4">Normal</th><th scope="col" className="p-4 text-accent-ink">Premium</th></tr></thead>
          <tbody className="divide-y divide-line">{PLAN_COMPARISON.map(row => <tr key={row.feature}><th scope="row" className="p-4 font-medium">{row.feature}</th><td className="p-4 text-muted">{row.normal}</td><td className="p-4">{row.premium}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="mt-6 space-y-3 text-sm text-muted">
        <p>Normal’s 3-day AI draft is the only AI feature included for free. You can always add, move and edit activities manually on all days.</p>
        <p>Trip permissions still apply: Premium does not give viewers permission to edit the shared plan. Location sharing is always optional for each member.</p>
        <p>If Premium ends, the trip returns to Normal. Saved information is kept, and manual itinerary changes, bookings and packing remain available.</p>
      </div>
    </main>
  </>;
}
