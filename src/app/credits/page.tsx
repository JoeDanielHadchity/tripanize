import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AppHeader } from "@/components/shell";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { creditHistory, creditsView } from "@/server/credits/service";
import { CREDIT_BUNDLES } from "@/lib/credits";

// A quiet page, reached from the Account page and the "running low" notes, not from the menu.
export const metadata: Metadata = { title: "AI credits", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const SPEND_LABELS: Record<string, string> = {
  plan: "Planned days with AI", regenerate: "Regenerated days with AI", restaurants: "Restaurant ideas", events: "Event search",
  destination: "Destination ideas", assistant: "AI assistant", swap: "Stop alternatives", packing: "Packing suggestions",
};
const BUNDLE_COPY: Record<string, string> = {
  topup: "A little extra to keep planning.",
  starter: "Plenty for a whole trip. Also unlocks Premium for one trip.",
  plus: "Room for two trips, or one with lots of changes. Also unlocks Premium for one trip.",
  pro: "For frequent travellers. Also unlocks Premium for one trip.",
};
const ORDER = ["topup", "starter", "plus", "pro"];
const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const when = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function CreditsPage() {
  const user = await requireUser();
  const view = await creditsView(user.id);
  const history = view.active ? await creditHistory(user.id, 50) : [];
  const trips = await prisma.trip.findMany({ where: { id: { in: history.map(h => h.tripId).filter((v): v is string => Boolean(v)) } }, select: { id: true, name: true } });
  const tripName = (id: string | null) => trips.find(t => t.id === id)?.name;
  const label = (h: (typeof history)[number]) => h.kind === "spend" ? SPEND_LABELS[h.note ?? ""] ?? "AI" : h.kind === "welcome" ? "Welcome credits" : h.kind === "purchase" ? h.note ?? "Top up" : h.note ?? (h.kind === "grant" ? "Credits from Tripanize" : "Adjusted by Tripanize");
  const bundles = [...CREDIT_BUNDLES].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  return (
    <>
      <AppHeader user={user} current="account" />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <Link href="/account" className="text-sm text-muted hover:text-ink">← Account</Link>
        <PageHeader title="AI credits" subtitle="Planning with AI, event searches and the AI assistant use credits. Everything else in Tripanize works without them." />
        {!view.active ? <Notice className="mb-6">Your AI planning works as usual. Nothing to top up.</Notice> : <>
          <Card className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm text-muted">Your balance</p>
            <p className="font-display text-4xl font-extrabold tabular-nums">{view.balance}<span className="ml-2 text-base font-bold text-muted">credits</span></p>
            <p className="w-full text-xs text-muted">Credits don't expire. If something goes wrong with an AI request, its credits come back automatically.</p>
          </Card>

          <section aria-labelledby="topup-h" className="mb-10">
            <h2 id="topup-h" className="mb-4 font-display text-2xl font-extrabold">Top up</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {bundles.map(b => (
                <li key={b.id}><Card className="flex h-full flex-col">
                  <div className="flex items-baseline justify-between gap-3"><p className="font-display text-2xl font-extrabold tabular-nums">{b.credits}<span className="ml-1.5 text-sm font-bold text-muted">credits</span></p><p className="font-bold">{money(b.priceCents)}</p></div>
                  {b.id === "pro" && <Badge tone="accent" className="mt-2 self-start">Best value</Badge>}
                  <p className="mt-2 flex-1 text-sm text-muted">{BUNDLE_COPY[b.id]}</p>
                  <button type="button" disabled className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-surface-2 px-5 text-sm font-bold text-muted">Coming soon</button>
                </Card></li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="history-h">
            <h2 id="history-h" className="mb-4 font-display text-2xl font-extrabold">History</h2>
            {history.length === 0 ? <Card><p className="text-sm text-muted">Nothing yet.</p></Card> : <Card className="p-0">
              <ul className="divide-y divide-line">
                {history.map(h => <li key={h.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="min-w-0"><span className="block font-medium">{label(h)}</span><span className="block text-xs text-muted">{when(h.createdAt)}{tripName(h.tripId) ? <> · <Link href={`/trips/${h.tripId}`} className="underline">{tripName(h.tripId)}</Link></> : null}</span></span>
                  <span className={`shrink-0 font-bold tabular-nums ${h.amount > 0 ? "text-sage-ink" : ""}`}>{h.amount > 0 ? `+${h.amount}` : h.amount}</span>
                </li>)}
              </ul>
            </Card>}
            <p className="mt-3 text-xs text-muted">On a trip, editors use the organizer's credits unless the organizer turns that off in Trip settings.</p>
          </section>
        </>}
      </main>
    </>
  );
}
