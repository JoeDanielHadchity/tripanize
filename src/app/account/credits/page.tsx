import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AppHeader } from "@/components/shell";
import { Card, Notice, PageHeader } from "@/components/ui";
import { MembersCreditsSwitch } from "@/components/members-credits-switch";
import { creditHistory, creditsView, tripCreditSpending } from "@/server/credits/service";
import { CREDIT_BUNDLES, CREDIT_PRICES } from "@/lib/credits";
import { CreditTopUp } from "@/components/credit-top-up";
import { refreshCreditPayments, unlockableTrips } from "@/server/billing/credits";
import { creditCheckoutAvailable } from "@/server/billing/config";

// The one place people see their credits: Account › Credits. Not in the menu, not indexed.
export const metadata: Metadata = { title: "Credits", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const SPEND_LABELS: Record<string, string> = {
  plan: "Planned days with AI", regenerate: "Regenerated days with AI", restaurants: "Restaurant ideas", events: "Event search",
  destination: "Destination ideas", assistant: "AI assistant", swap: "Stop alternatives", packing: "Packing suggestions",
};
const COSTS: [string, number | "Free"][] = [
  ["Plan or regenerate one day with AI (restaurants included)", CREDIT_PRICES.planDay],
  ["Find events for your trip", CREDIT_PRICES.events],
  ["Find a destination (5 ideas). Your first search is free", CREDIT_PRICES.destination],
  ["Ask the AI assistant", CREDIT_PRICES.assistant],
  ["Swap a stop for alternatives", CREDIT_PRICES.swap],
  ["Packing suggestions", CREDIT_PRICES.packing],
  ["Refresh restaurant ideas, per day", CREDIT_PRICES.restaurantsDay],
  ["Scan a receipt", "Free"],
  ["Automatic event checks before your trip (up to 10)", "Free"],
];
const ORDER = ["topup", "starter", "plus", "pro"];
const when = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function AccountCreditsPage() {
  const user = await requireUser();
  // Catches up any payment whose confirmation didn't arrive (it is checked with Paddle, never trusted from the page).
  await refreshCreditPayments(user.id).catch(error => console.error("[credits] refresh on open failed", error instanceof Error ? error.message : error));
  const view = await creditsView(user.id);
  const history = view.active ? await creditHistory(user.id, 50) : [];
  const owned = view.active ? await prisma.trip.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, membersUseCredits: true, _count: { select: { memberships: true } } } }) : [];
  const spending = new Map<string, number>();
  for (const t of owned) spending.set(t.id, (await tripCreditSpending(t.id)).reduce((sum, s) => sum + s.credits, 0));
  const names = await prisma.trip.findMany({ where: { id: { in: history.map(h => h.tripId).filter((v): v is string => Boolean(v)) } }, select: { id: true, name: true } });
  const tripName = (id: string | null) => names.find(t => t.id === id)?.name;
  const label = (h: (typeof history)[number]) => h.kind === "spend" ? SPEND_LABELS[h.note ?? ""] ?? "AI" : h.kind === "welcome" ? "Welcome credits" : h.kind === "purchase" ? h.note ?? "Top up" : h.note ?? (h.kind === "grant" ? "Credits from Tripanize" : "Adjusted by Tripanize");
  const bundles = [...CREDIT_BUNDLES].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const h2 = "mb-3 font-display text-xl font-semibold";
  return (
    <>
      <AppHeader user={user} current="account" />
      <main id="main" className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Link href="/account" className="text-sm text-muted hover:text-ink">← Account</Link>
        <PageHeader title="Credits" subtitle="Planning with AI, event searches and the AI assistant use credits. Everything else in Tripanize works without them." />
        {!view.active ? <Notice>Your AI planning works as usual. Nothing to top up.</Notice> : <div className="space-y-10">

          <section aria-labelledby="balance-h">
            <Card className="flex flex-wrap items-center justify-between gap-4">
              <div><h2 id="balance-h" className="text-sm text-muted">Your balance</h2><p className="font-display text-4xl font-extrabold tabular-nums">{view.balance}<span className="ml-2 text-base font-bold text-muted">AI credits</span></p></div>
              <a href="#top-up" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-bold text-on-accent">Top up</a>
              <p className="w-full text-xs text-muted">Credits don't expire. If something goes wrong with an AI request, its credits come back automatically.</p>
            </Card>
          </section>

          <section aria-labelledby="costs-h">
            <h2 id="costs-h" className={h2}>What each task costs</h2>
            <Card className="p-0">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">AI credits per task</caption>
                <thead className="text-xs text-muted"><tr><th scope="col" className="px-4 py-3 font-medium">Task</th><th scope="col" className="px-4 py-3 text-right font-medium">Credits</th></tr></thead>
                <tbody className="divide-y divide-line">{COSTS.map(([what, n]) => <tr key={what}><th scope="row" className="px-4 py-3 font-normal">{what}</th><td className="px-4 py-3 text-right font-bold tabular-nums">{n}</td></tr>)}</tbody>
              </table>
            </Card>
            <p className="mt-2 text-xs text-muted">A week-long trip with a round of changes usually uses about 60 credits.</p>
          </section>

          <section aria-labelledby="top-up-h" id="top-up" className="scroll-mt-24">
            <h2 id="top-up-h" className={h2}>Top up</h2>
            <CreditTopUp bundles={bundles} trips={await unlockableTrips(user.id)} available={creditCheckoutAvailable()} />
            <p className="mt-2 text-xs text-muted">One payment each, no subscription. Taxes, if any, are shown at checkout.</p>
          </section>

          {owned.length > 0 && <section aria-labelledby="trips-h">
            <h2 id="trips-h" className={h2}>Your trips</h2>
            <p className="mb-3 text-sm text-muted">Editors on trips you organize use your credits for AI. You can turn that off per trip. Viewers never use your credits.</p>
            <Card className="p-0"><ul className="divide-y divide-line">
              {owned.map(t => <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-0"><Link href={`/trips/${t.id}`} className="block font-medium underline-offset-2 hover:underline">{t.name}</Link><span className="block text-xs text-muted">{spending.get(t.id) ?? 0} credits used here</span></span>
                {t._count.memberships > 1 ? <MembersCreditsSwitch tripId={t.id} on={t.membersUseCredits} /> : <span className="text-xs text-muted">Only you so far</span>}
              </li>)}
            </ul></Card>
          </section>}

          <section aria-labelledby="history-h">
            <h2 id="history-h" className={h2}>History</h2>
            {history.length === 0 ? <Card><p className="text-sm text-muted">Nothing yet.</p></Card> : <Card className="p-0">
              <ul className="divide-y divide-line">
                {history.map(h => <li key={h.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="min-w-0"><span className="block font-medium">{label(h)}</span><span className="block text-xs text-muted">{when(h.createdAt)}{tripName(h.tripId) ? <> · <Link href={`/trips/${h.tripId}`} className="underline">{tripName(h.tripId)}</Link></> : null}</span></span>
                  <span className={`shrink-0 font-bold tabular-nums ${h.amount > 0 ? "text-sage-ink" : ""}`}>{h.amount > 0 ? `+${h.amount}` : h.amount}</span>
                </li>)}
              </ul>
            </Card>}
          </section>
        </div>}
      </main>
    </>
  );
}
