import Link from "next/link";
import type { ReactNode } from "react";
import type { adminOverview } from "@/server/admin/operations";
import { formatMoney } from "@/lib/money";
import { AdminIcon } from "./nav";

type Overview = Awaited<ReturnType<typeof adminOverview>>;

function Stat({ label, value, detail, good, href }: { label: string; value: string | number; detail?: string; good?: boolean; href: string }) {
  return <Link href={href} className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent focus-visible:outline-accent">
    <p className="text-sm text-muted">{label}</p>
    <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
    {detail && <p className={`mt-1 text-sm ${good ? "font-medium text-sage-ink" : "text-muted"}`}>{detail}</p>}
  </Link>;
}

function Row({ icon, tone, children, href, action }: { icon: string; tone: "warn" | "ok" | "info"; children: ReactNode; href?: string; action?: string }) {
  const color = tone === "warn" ? "text-ai-ink" : tone === "ok" ? "text-sage-ink" : "text-accent-ink";
  const body = <><AdminIcon name={icon} className={`h-5 w-5 ${color}`} /><span className="min-w-0 flex-1 text-sm">{children}</span>{action && <span className="text-sm font-semibold text-accent-ink">{action}</span>}</>;
  return href ? <Link href={href} className="flex items-center gap-3 border-b border-line py-3 last:border-0 hover:text-accent-ink">{body}</Link> : <div className="flex items-center gap-3 border-b border-line py-3 last:border-0">{body}</div>;
}

const greeting = () => { const h = Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Riyadh", hour: "numeric", hour12: false })); return h < 5 || h >= 18 ? "Good evening" : h < 12 ? "Good morning" : "Good afternoon"; };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Dashboard home: four key numbers, what needs attention and one-click shortcuts. */
export function AdminHome({ d, name }: { d: Overview; name: string }) {
  const attention: ReactNode[] = [];
  if (d.openSupport) attention.push(<Row key="support" icon="support" tone="warn" href="/company?tab=support" action="Open">{plural(d.openSupport, "open support request")}</Row>);
  if (d.trialsEnding) attention.push(<Row key="trials" icon="trials" tone="info" href="/company?tab=trials" action="View">{plural(d.trialsEnding, "trial")} ending within 3 days</Row>);
  if (d.pendingPayments) attention.push(<Row key="pay" icon="payments" tone="info" href="/company?tab=payments" action="View">{plural(d.pendingPayments, "payment")} not finished yet</Row>);
  if (d.failedJobs) attention.push(<Row key="jobs" icon="alert" tone="warn" href="/company?tab=health" action="Check">{plural(d.failedJobs, "AI plan")} failed this week</Row>);
  if (d.failedEmails) attention.push(<Row key="emails" icon="alert" tone="warn" href="/company?tab=health" action="Check">{plural(d.failedEmails, "email")} could not be sent</Row>);
  if (d.unpricedAi) attention.push(<Row key="ai" icon="ai" tone="info" href="/company?tab=ai" action="Review">{plural(d.unpricedAi, "AI request")} without a cost estimate</Row>);
  const setup = [["AI", d.aiConfigured], ["Email", d.emailConfigured], ["Payments", d.paddleConfigured]].filter(([, ok]) => !ok).map(([label]) => label);
  if (setup.length) attention.push(<Row key="setup" icon="alert" tone="warn" href="/company?tab=health" action="Check">Not set up: {setup.join(", ")}</Row>);
  if (!attention.length) attention.push(<Row key="ok" icon="check" tone="ok">Nothing needs you right now. All systems working.</Row>);

  const actions: [string, string, string][] = [
    ["Invite a trial user", "/company?tab=trials", "trials"],
    ["Post a banner", "/company?tab=announcements", "announcements"],
    ["Answer support", "/company?tab=support", "support"],
    ["Find a user", "/company?tab=users", "users"],
  ];

  return <section className="min-w-0 space-y-5">
    <div><h2 className="font-display text-3xl font-semibold">{greeting()}, {name.split(" ")[0] || "there"}</h2><p className="mt-1 text-sm text-muted">Last 30 days{d.environment === "sandbox" ? " · payments shown are from the sandbox" : ""}</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Users" value={d.users} detail={d.newUsers ? `+${d.newUsers} new · ${d.activeUsers} active` : `${d.activeUsers} active`} good={d.newUsers > 0} href="/company?tab=users" />
      <Stat label="Trips" value={d.trips} detail={d.newTrips ? `+${d.newTrips} new` : "No new trips"} good={d.newTrips > 0} href="/company?tab=trips" />
      <Stat label="Sales" value={formatMoney(d.recentSalesMinor, "USD")} detail={`${plural(d.recentSales, "purchase")} · ${formatMoney(d.salesMinor, "USD")} all time`} href="/company?tab=payments" />
      <Stat label="AI cost" value={formatMoney(Math.round(d.aiCostMicros / 10_000), "USD")} detail={`${plural(d.aiRequests, "request")}${d.failedAi ? ` · ${d.failedAi} failed` : ""}`} href="/company?tab=ai" />
    </div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-line bg-surface px-5 py-4"><h3 className="font-semibold">Needs your attention</h3><div className="mt-1">{attention}</div></div>
      <div className="rounded-2xl border border-line bg-surface px-5 py-4"><h3 className="font-semibold">Quick actions</h3>
        <div className="mt-3 grid gap-2">{actions.map(([label, href, icon], i) => <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${i === 0 ? "bg-accent text-on-accent" : "bg-accent-soft text-accent-ink hover:bg-accent hover:text-on-accent"}`}><AdminIcon name={icon} className="h-[18px] w-[18px]" />{label}</Link>)}</div>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Premium purchases" value={d.verifiedPurchases} detail="All time, verified" href="/company?tab=payments" />
      <Stat label="Trials that paid" value={`${d.trialPurchases} / ${d.trials}`} detail="Accepted trials with a purchase" href="/company?tab=trials" />
      <Stat label="Suspended accounts" value={d.suspended} href="/company?tab=users" />
    </div>
  </section>;
}
