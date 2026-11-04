import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AppHeader } from "@/components/shell";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { creditHistory, creditsView } from "@/server/credits/service";
import { CREDIT_BUNDLES, CREDIT_PRICES, WELCOME_CREDITS } from "@/lib/credits";

export const metadata: Metadata = { title: "Credits" };
export const dynamic = "force-dynamic";

const SPEND_LABELS: Record<string, string> = {
  plan: "Planned days with AI", regenerate: "Regenerated days with AI", restaurants: "Restaurant ideas", events: "Event search",
  destination: "Destination ideas", assistant: "AI assistant question", swap: "Swapped a stop", packing: "Packing suggestions",
};
const BUNDLE_BUYS: Record<string, string> = {
  starter: "Plan a week-long trip, find events, get packing, regenerate 2 days, swap 4 stops and ask about 20 questions, with about 20 credits left.",
  plus: "The same for two week-long trips, or one long trip with plenty of changes.",
  pro: "About five trips, or one trip with a lot of AI help along the way.",
  topup: "Regenerate 3 days and ask 10 questions.",
};
const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const when = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function CreditsPage() {
  const user = await requireUser();
  const view = await creditsView(user.id);
  const history = view.active ? await creditHistory(user.id, 50) : [];
  const trips = await prisma.trip.findMany({ where: { id: { in: history.map(h => h.tripId).filter((v): v is string => Boolean(v)) } }, select: { id: true, name: true } });
  const tripName = (id: string | null) => trips.find(t => t.id === id)?.name;
  const label = (h: (typeof history)[number]) => h.kind === "spend" ? SPEND_LABELS[h.note ?? ""] ?? "AI action" : h.kind === "welcome" ? "Welcome credits" : h.kind === "purchase" ? h.note ?? "Credits bought" : h.note ?? (h.kind === "grant" ? "Credits from Tripanize" : "Adjusted by Tripanize");
  return (
    <>
      <AppHeader user={user} />
      <main id="main" className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <PageHeader title="Credits" subtitle="AI planning, events and the assistant use credits. Everything else in Tripanize is free to use." />
        {!view.active && <Notice className="mb-6" title="Credits aren't on for your account yet">AI works as it does today. When credits start, this page shows your balance and history, and you'll get {WELCOME_CREDITS} free credits to begin.</Notice>}

        {view.active && <section aria-labelledby="balance-h" className="night-card mb-8 rounded-[28px] bg-night p-6 text-night-ink sm:p-8">
          <h2 id="balance-h" className="text-xs font-extrabold uppercase tracking-[0.14em] text-night-accent">Your balance</h2>
          <p className="mt-3 font-display text-6xl font-extrabold tabular-nums">{view.balance}<span className="ml-3 text-2xl font-bold text-night-muted">credits</span></p>
          <p className="mt-3 text-sm text-night-muted">Credits never expire. If an AI action fails, its credits come back automatically.</p>
        </section>}

        <section aria-labelledby="bundles-h" className="mb-10">
          <h2 id="bundles-h" className="mb-1 font-display text-2xl font-extrabold">Get credits</h2>
          <p className="mb-4 text-sm text-muted">One payment, no subscription. Starter, Plus and Pro also unlock Premium for one trip: shared expenses, group chat, member locations and the AI assistant.</p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {CREDIT_BUNDLES.map(b => (
              <li key={b.id}><Card className="flex h-full flex-col">
                <div className="flex items-baseline justify-between gap-3"><h3 className="font-display text-xl font-extrabold">{b.name}</h3>{b.id === "pro" && <Badge tone="accent">Best value</Badge>}</div>
                <p className="mt-2 font-display text-4xl font-extrabold tabular-nums">{b.credits}<span className="ml-2 text-base font-bold text-muted">credits</span></p>
                <p className="mt-1 text-sm font-semibold">{money(b.priceCents)} · {Math.round(b.priceCents / b.credits * 10) / 10}¢ a credit{b.unlocksPremium ? " · unlocks Premium for 1 trip" : ""}</p>
                <p className="mt-3 flex-1 text-sm text-muted">{BUNDLE_BUYS[b.id]}</p>
                <button type="button" disabled className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-surface-2 px-5 text-sm font-bold text-muted">Buying opens soon</button>
              </Card></li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="prices-h" className="mb-10">
          <h2 id="prices-h" className="mb-1 font-display text-2xl font-extrabold">What things cost</h2>
          <p className="mb-4 text-sm text-muted">You always see the price on the button before anything is spent.</p>
          <Card className="p-0">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Credits per AI action</caption>
              <thead className="text-xs uppercase tracking-wide text-muted"><tr><th scope="col" className="px-4 py-3">Action</th><th scope="col" className="px-4 py-3 text-right">Credits</th></tr></thead>
              <tbody className="divide-y divide-line">
                {[["Plan or regenerate one day with AI, restaurants included", CREDIT_PRICES.planDay],["Find events for your trip", CREDIT_PRICES.events],["Find a destination (5 ideas)", CREDIT_PRICES.destination],["Ask the AI assistant", CREDIT_PRICES.assistant],["Swap a stop for alternatives", CREDIT_PRICES.swap],["Packing suggestions", CREDIT_PRICES.packing],["Refresh restaurant ideas, per day", CREDIT_PRICES.restaurantsDay],["Scan a receipt", "Free"],["Automatic event checks before your trip (up to 10)", "Free"]].map(([what, n]) => <tr key={String(what)}><th scope="row" className="px-4 py-3 font-medium">{what}</th><td className="px-4 py-3 text-right font-bold tabular-nums">{n}</td></tr>)}
              </tbody>
            </table>
          </Card>
          <p className="mt-3 text-xs text-muted">On a trip, editors use the organizer's credits unless the organizer turns that off in Trip settings.</p>
        </section>

        {view.active && <section aria-labelledby="history-h">
          <h2 id="history-h" className="mb-4 font-display text-2xl font-extrabold">History</h2>
          {history.length === 0 ? <Card><p className="text-sm text-muted">Nothing yet.</p></Card> : <Card className="p-0">
            <ul className="divide-y divide-line">
              {history.map(h => <li key={h.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="min-w-0"><span className="block font-medium">{label(h)}</span><span className="block text-xs text-muted">{when(h.createdAt)}{tripName(h.tripId) ? <> · <Link href={`/trips/${h.tripId}`} className="underline">{tripName(h.tripId)}</Link></> : null}</span></span>
                <span className={`shrink-0 font-bold tabular-nums ${h.amount > 0 ? "text-sage-ink" : ""}`}>{h.amount > 0 ? `+${h.amount}` : h.amount}</span>
              </li>)}
            </ul>
          </Card>}
        </section>}
      </main>
    </>
  );
}
