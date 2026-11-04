import { Badge, Card, Notice } from "@/components/ui";
import { AdminButton } from "./controls";
import type { openAiCostCheck } from "@/server/admin/openai-costs";

type Check = Awaited<ReturnType<typeof openAiCostCheck>>;
const usd = (n: number | null) => n === null ? "—" : `$${n.toFixed(n < 1 ? 3 : 2)}`;
const cents = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}¢`;
const STATUS: Record<Check["rows"][number]["status"], { label: string; tone: "sage" | "warn" | "danger" | "neutral" }> = {
  ok: { label: "Within target", tone: "sage" },
  "above-target": { label: "Above target", tone: "warn" },
  losing: { label: "Losing money", tone: "danger" },
  "no-credits": { label: "No credits used", tone: "neutral" },
};
const when = (d: Date) => new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

/** Company page, AI tab: the real OpenAI bill next to the credits people spent, day by day. */
export function OpenAiCostCheck({ check }: { check: Check }) {
  const perCredit = check.totals.creditsSpent > 0 ? (check.totals.openAiUsd ?? check.totals.estimateUsd) / check.totals.creditsSpent : null;
  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-display text-xl font-semibold">OpenAI bill vs credits</h3>
        <p className="mt-1 text-sm text-muted">Each day's AI cost against the credits people spent. Target: at most {cents(check.targetCostPerCredit)} of AI per credit. A sold credit brings in at least {cents(check.minRevenuePerCredit)} after fees.</p></div>
      {check.configured && <AdminButton command={{ op: "openai.costs.refresh" }}>Refresh from OpenAI</AdminButton>}
    </div>
    {!check.configured && <Notice className="mt-4" title="Connect your OpenAI bill">Create an admin key in OpenAI (Settings → Organization → Admin keys) and add it in Cloudflare as the encrypted secret <code>OPENAI_ADMIN_KEY</code>. Until then this uses Tripanize's own estimate, which needs the rates in AI controls below.</Notice>}
    {check.error && <Notice className="mt-4" tone="warn">{check.error} Showing Tripanize's own estimate meanwhile.</Notice>}
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
      <div><dt className="text-muted">OpenAI, last 30 days</dt><dd className="mt-1 font-display text-2xl font-semibold">{usd(check.totals.openAiUsd)}</dd></div>
      <div><dt className="text-muted">Tripanize estimate</dt><dd className="mt-1 font-display text-2xl font-semibold">{usd(check.totals.estimateUsd)}</dd></div>
      <div><dt className="text-muted">Credits spent</dt><dd className="mt-1 font-display text-2xl font-semibold">{check.totals.creditsSpent}</dd></div>
      <div><dt className="text-muted">AI cost per credit</dt><dd className="mt-1 font-display text-2xl font-semibold">{perCredit === null ? "—" : cents(perCredit)}</dd></div>
    </dl>
    {check.rows.length > 0 ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm">
      <caption className="sr-only">Daily AI cost against credits spent</caption>
      <thead className="text-xs text-muted"><tr><th scope="col" className="py-2 font-medium">Day (UTC)</th><th scope="col" className="py-2 text-right font-medium">OpenAI</th><th scope="col" className="py-2 text-right font-medium">Estimate</th><th scope="col" className="py-2 text-right font-medium">Credits spent</th><th scope="col" className="py-2 text-right font-medium">Per credit</th><th scope="col" className="py-2 pl-4 font-medium">Status</th></tr></thead>
      <tbody className="divide-y divide-line">{check.rows.slice(0, 14).map(r => <tr key={r.date}>
        <th scope="row" className="py-2 font-normal">{r.date}</th><td className="py-2 text-right tabular-nums">{usd(r.openAiUsd)}</td><td className="py-2 text-right tabular-nums text-muted">{usd(r.estimateUsd)}</td><td className="py-2 text-right tabular-nums">{r.creditsSpent}</td><td className="py-2 text-right tabular-nums">{r.costPerCredit === null ? "—" : cents(r.costPerCredit)}</td><td className="py-2 pl-4"><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
      </tr>)}</tbody>
    </table></div> : <p className="mt-4 text-sm text-muted">No AI use in the last 30 days.</p>}
    <p className="mt-3 text-xs text-muted">Before credits launch, most AI use isn't paid with credits (free plan, Premium without credits, automatic event checks), so days will show high cost per credit. {check.fetchedAt ? `OpenAI figures from ${when(check.fetchedAt)}; refreshed at most hourly.` : ""}</p>
  </Card>;
}
