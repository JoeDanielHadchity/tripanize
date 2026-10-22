import type { Metadata } from "next";
import { getSessionUser } from "@/server/auth/session";
import { AppHeader, Logo } from "@/components/shell";
import { Badge, Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { PLAN_COMPARISON, PREMIUM_BANDS, premiumPrice } from "@/lib/plans";
import { checkoutAvailable } from "@/server/billing/config";

export const metadata: Metadata = { title: "Normal and Premium pricing" };
export default async function PlansPage() {
  const user = await getSessionUser();
  const available = checkoutAvailable();
  return <>
    {user ? <AppHeader user={user} /> : <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4"><Logo /><LinkButton href="/sign-in">Sign in</LinkButton></header>}
    <main id="main" className="mx-auto max-w-5xl px-4 pb-16 pt-8">
      <PageHeader title="One trip. Your whole group." subtitle="Start free with Normal, or unlock Premium for one trip with one payment." />
      {!available && <Notice tone="accent" className="mb-6">Premium payments are coming soon. These are our planned launch prices. Your existing trip stays available during the preview.</Notice>}
      <Card className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><Badge>Normal · Free</Badge><h2 className="mt-3 font-display text-2xl font-semibold">A little help to get started</h2><p className="mt-2 max-w-xl text-sm text-muted">AI itinerary for the first 3 days per trip. Plan all other days manually, add your bookings and build your packing list.</p></div>
        <LinkButton href={user ? "/trips" : "/sign-up"}>{user ? "Open my trips" : "Start free"}</LinkButton>
      </Card>
      <section aria-labelledby="premium-h"><h2 id="premium-h" className="font-display text-2xl font-semibold">Premium for every kind of group</h2><p className="mb-4 mt-2 text-sm text-muted">All three options include the same Premium features. The price covers everyone in one trip.</p>
        <div className="grid gap-4 md:grid-cols-3">{PREMIUM_BANDS.map(b => <Card key={b.id} className={b.id === "medium" ? "border-accent bg-accent-soft/30" : ""}>
          <Badge tone={b.id === "medium" ? "accent" : "neutral"}>Premium · {b.label}</Badge>
          <p className="mt-5"><span className="font-display text-4xl font-semibold">{premiumPrice(b.priceMinor)}</span><span className="ml-2 text-sm text-muted">USD / trip</span></p>
          <p className="mt-2 text-sm font-medium">One payment for the whole group</p><p className="mt-3 text-sm text-muted">AI itinerary tools, AI assistant, expenses and settlements, chat, optional member locations, events and packing suggestions.</p>
          <LinkButton href={user ? "/trips" : "/sign-up"} variant={b.id === "medium" ? "primary" : "secondary"} className="mt-5 w-full">{available ? "Choose a trip" : "Plan a trip"}</LinkButton>
        </Card>)}</div>
      </section>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><Card><h3 className="font-semibold">Your group grows? Pay the difference.</h3><p className="mt-2 text-sm text-muted">Move from the $9 option to $15 for $6, or from $15 to $25 for $10. Previous verified payments for that trip count toward the upgrade. Adding people beyond your paid limit requires an upgrade to use Premium.</p></Card><Card><h3 className="font-semibold">Everyone counts, once.</h3><p className="mt-2 text-sm text-muted">The organizer, adults, children and travelers without an account all count. We use the largest of the trip’s planned people total, active travelers and members, so overlapping lists aren’t added together.</p></Card></div>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-line bg-surface"><table className="w-full text-left text-sm"><caption className="sr-only">Compare Normal and Premium features</caption><thead className="bg-surface-2"><tr><th scope="col" className="p-4">Feature</th><th scope="col" className="p-4">Normal</th><th scope="col" className="p-4 text-accent-ink">Premium</th></tr></thead><tbody className="divide-y divide-line">{PLAN_COMPARISON.map(row => <tr key={row.feature}><th scope="row" className="p-4 font-medium">{row.feature}</th><td className="p-4 text-muted">{row.normal}</td><td className="p-4">{row.premium}</td></tr>)}</tbody></table></div>
      <div className="mt-6 space-y-3 text-sm text-muted"><p>No subscription or automatic renewal. Prices are in US dollars; applicable tax is shown before payment. Groups larger than 12 can keep using Normal; a larger Premium option is not available yet.</p><p>AI requests have usage limits. Trip permissions still apply, and each member chooses whether to share their location.</p><p>The organizer purchases Premium from that trip’s settings. A purchase covers that trip only. Saved information stays in the trip if Premium access changes.</p></div>
    </main>
  </>;
}
