import Link from "next/link";
import { Card, Notice } from "@/components/ui";
import { AdminButton } from "./controls";
import { visitorReport, visitorsConfigured, type Row, type VisitorRange, type VisitorReport } from "@/server/admin/visitors";

const n = (v: number | null) => v === null ? "—" : v.toLocaleString("en-US");
const when = (d: string) => new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <Card className="h-full"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-3 font-display text-3xl font-semibold tabular-nums">{value}</p>{detail && <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>}</Card>;
}

/** Visits per day as thin bars (one series, so no legend); hover a day for its numbers, and the table below has them all. */
function DailyChart({ days }: { days: VisitorReport["days"] }) {
  const max = Math.max(1, ...days.map(d => d.visits));
  const label = (d: VisitorReport["days"][number]) => `${day(d.date)}: ${n(d.visits)} visits, ${n(d.views)} page views, ${d.signups} sign-ups`;
  return <figure>
    <div className="flex h-40 items-end gap-[2px] border-b border-line" role="img" aria-label={`Visits per day, ${day(days[0].date)} to ${day(days.at(-1)!.date)}. Peak ${n(max)} visits.`}>
      {days.map(d => <div key={d.date} title={label(d)} className="group relative flex h-full min-w-0 flex-1 items-end">
        <div className="w-full rounded-t-[4px] bg-accent transition-opacity group-hover:opacity-80" style={{ height: `${Math.max(d.visits ? 2 : 0, (d.visits / max) * 100)}%` }} />
      </div>)}
    </div>
    <figcaption className="mt-2 flex justify-between text-xs text-muted"><span>{day(days[0].date)}</span><span>Visits per day · peak {n(max)}</span><span>{day(days.at(-1)!.date)}</span></figcaption>
  </figure>;
}

/** A ranked list with a thin proportional bar under each name. */
function Top({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  const max = Math.max(1, ...rows.map(r => r.views));
  return <Card>
    <h3 className="font-display text-lg font-semibold">{title}</h3>
    {rows.length ? <table className="mt-3 w-full text-sm">
      <thead className="text-xs text-muted"><tr><th scope="col" className="pb-2 text-left font-medium">Name</th><th scope="col" className="pb-2 text-right font-medium">Views</th><th scope="col" className="pb-2 text-right font-medium">Visits</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.key} className="align-top">
        <th scope="row" className="py-1.5 pr-3 text-left font-normal"><span className="block break-all">{r.key}</span><span className="mt-1 block h-1 rounded-full bg-accent/70" style={{ width: `${Math.max(2, (r.views / max) * 100)}%` }} /></th>
        <td className="py-1.5 text-right tabular-nums">{n(r.views)}</td><td className="py-1.5 pl-3 text-right tabular-nums text-muted">{n(r.visits)}</td>
      </tr>)}</tbody>
    </table> : <p className="mt-3 text-sm text-muted">{empty}</p>}
  </Card>;
}

function Setup() {
  return <Notice title="Connect Cloudflare analytics">
    <p>Web Analytics is already collecting visits for tripanize.app. To show them here, give the website a read-only Cloudflare token:</p>
    <ol className="mt-2 list-decimal space-y-1 pl-5">
      <li>In Cloudflare, open <strong>My Profile → API Tokens → Create Token → Create Custom Token</strong>.</li>
      <li>Add two permissions: <strong>Account · Account Analytics · Read</strong> and <strong>Zone · Analytics · Read</strong> (zone: tripanize.app). Nothing else.</li>
      <li>Create it, copy the token, then open <strong>Workers &amp; Pages → tripanize → Settings → Variables and secrets</strong> and add a <strong>Secret</strong> named <code>CLOUDFLARE_ANALYTICS_TOKEN</code> with the token as its value.</li>
    </ol>
    <p className="mt-2">The tab fills in a minute after the secret is saved.</p>
  </Notice>;
}

export async function Visitors({ userId, range }: { userId: string; range: VisitorRange }) {
  if (!visitorsConfigured()) return <Setup />;
  let report: VisitorReport | null = null, error = "";
  try { report = await visitorReport(userId, range); } catch (e) { error = e instanceof Error ? e.message : "Cloudflare's analytics aren't available right now."; }
  const tabs = <div className="flex flex-wrap items-center justify-between gap-3">
    <nav aria-label="Period" className="flex gap-1 rounded-xl border border-line bg-surface p-1 text-sm">{([7, 30] as const).map(r => <Link key={r} href={`/company?tab=visitors&range=${r}`} aria-current={r === range ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${r === range ? "bg-accent-soft font-semibold text-accent-ink" : "text-muted hover:text-ink"}`}>Last {r} days</Link>)}</nav>
    <AdminButton command={{ op: "visitors.refresh", range }}>Refresh from Cloudflare</AdminButton>
  </div>;
  if (!report) return <>{tabs}<Notice tone="warn">{error}</Notice></>;
  const t = report.totals;
  return <>
    {tabs}
    {report.warning && <Notice tone="warn">{report.warning}</Notice>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Visits" value={n(t.visits)} detail="Separate browsing sessions by real browsers" />
      <Stat label="Page views" value={n(t.views)} detail={t.visits ? `${(t.views / t.visits).toFixed(1)} pages per visit` : undefined} />
      <Stat label="New sign-ups" value={n(t.signups)} detail={t.visits ? `${((t.signups / t.visits) * 100).toFixed(1)}% of visits` : "From Tripanize's own records"} />
      <Stat label="All requests" value={n(t.requests)} detail={t.uniques === null ? "Needs Zone Analytics: Read" : `${n(t.uniques)} daily unique IPs added up · includes bots and files`} />
    </div>
    <Card><DailyChart days={report.days} /></Card>
    <div className="grid gap-4 lg:grid-cols-2">
      <Top title="Top pages" rows={report.pages} empty="No page views yet in this period." />
      <Top title="Where visitors came from" rows={report.referrers} empty="No referrers yet in this period." />
      <Top title="Countries" rows={report.countries} empty="No visits yet in this period." />
      <div className="grid gap-4"><Top title="Devices" rows={report.devices} empty="No visits yet." /><Top title="Browsers" rows={report.browsers} empty="No visits yet." /></div>
    </div>
    <Card>
      <h3 className="font-display text-lg font-semibold">Day by day</h3>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[30rem] text-sm">
        <caption className="sr-only">Visits, page views, sign-ups and total requests per day</caption>
        <thead className="text-xs text-muted"><tr><th scope="col" className="py-2 text-left font-medium">Day (UTC)</th><th scope="col" className="py-2 text-right font-medium">Visits</th><th scope="col" className="py-2 text-right font-medium">Page views</th><th scope="col" className="py-2 text-right font-medium">Sign-ups</th><th scope="col" className="py-2 text-right font-medium">All requests</th></tr></thead>
        <tbody className="divide-y divide-line">{[...report.days].reverse().map(d => <tr key={d.date}><th scope="row" className="py-2 text-left font-normal">{day(d.date)}</th><td className="py-2 text-right tabular-nums">{n(d.visits)}</td><td className="py-2 text-right tabular-nums">{n(d.views)}</td><td className="py-2 text-right tabular-nums">{d.signups}</td><td className="py-2 text-right tabular-nums text-muted">{n(d.requests)}</td></tr>)}</tbody>
      </table></div>
    </Card>
    <p className="text-xs leading-5 text-muted">Cloudflare Web Analytics counts visits from real browsers without cookies and never identifies a visitor; it estimates from a sample, so small numbers can move a little. “All requests” is Cloudflare's total traffic for the domain, bots and files included. Figures from {when(report.fetchedAt)}; refreshed every 10 minutes. To see who signed up, open the Users tab.</p>
  </>;
}
