import { prisma } from "@/server/db";
import { requireCompanyAdmin } from "./identity";
import { CREDIT_BUNDLES } from "@/lib/credits";

/**
 * Daily check of the real OpenAI bill against the credits people spent.
 * Reads OpenAI's Costs API (GET /v1/organization/costs) with an admin key kept in the
 * OPENAI_ADMIN_KEY secret. Tripanize never sees the OpenAI credit balance itself.
 */
export function openAiAdminConfigured() { return Boolean(process.env.OPENAI_ADMIN_KEY); }

/** What one credit should cost at most in AI; the prices were set around this. */
export const TARGET_COST_PER_CREDIT = 0.02;
/** The least a sold credit brings in: the cheapest bundle per credit, less about 15% in payment fees. */
export const MIN_REVENUE_PER_CREDIT = Math.min(...CREDIT_BUNDLES.map(b => b.priceCents / b.credits)) / 100 * 0.85;

const CACHE_KEY = "openai-costs:daily";
const CACHE_MS = 60 * 60_000;
const DAYS = 30;

export type DailyCost = { date: string; usd: number };
type Bucket = { start_time?: number; results?: unknown[]; result?: unknown[] };
type CostResult = { amount?: { value?: number | string; currency?: string } };

/** Sums each day's cost results (USD) from the Costs API's daily buckets. */
export function parseCostBuckets(data: unknown): DailyCost[] {
  const buckets = (data as { data?: Bucket[] } | null)?.data ?? [];
  return buckets.flatMap(b => {
    if (typeof b.start_time !== "number") return [];
    const usd = (b.results ?? b.result ?? []).reduce<number>((sum, r) => {
      const amount = (r as CostResult).amount;
      if (!amount || (amount.currency && amount.currency.toLowerCase() !== "usd")) return sum;
      const value = typeof amount.value === "string" ? Number.parseFloat(amount.value) : amount.value;
      return Number.isFinite(value) ? sum + (value as number) : sum;
    }, 0);
    return [{ date: new Date(b.start_time * 1000).toISOString().slice(0, 10), usd: Math.round(usd * 10000) / 10000 }];
  });
}

/** Last 30 days of OpenAI costs, cached for an hour. Throws a readable message when OpenAI refuses. */
export async function openAiDailyCosts(opts: { refresh?: boolean; fetcher?: typeof fetch; now?: Date } = {}): Promise<{ days: DailyCost[]; fetchedAt: Date }> {
  const now = opts.now ?? new Date();
  if (!opts.refresh) {
    const cached = await prisma.externalCache.findUnique({ where: { key: CACHE_KEY } });
    if (cached && now.getTime() - cached.fetchedAt.getTime() < CACHE_MS) return { days: cached.value as DailyCost[], fetchedAt: cached.fetchedAt };
  }
  const key = process.env.OPENAI_ADMIN_KEY;
  if (!key) throw new Error("Add an OpenAI admin key (OPENAI_ADMIN_KEY) to compare with your OpenAI bill.");
  const start = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000) - (DAYS - 1) * 86400;
  const days: DailyCost[] = [];
  let page: string | undefined;
  for (let i = 0; i < 5; i++) {
    const url = new URL("https://api.openai.com/v1/organization/costs");
    url.searchParams.set("start_time", String(start));
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", String(DAYS));
    if (page) url.searchParams.set("page", page);
    const res = await (opts.fetcher ?? fetch)(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 401 || res.status === 403) throw new Error("OpenAI refused the admin key. Check that it's an admin key from your OpenAI organization settings.");
    if (!res.ok) throw new Error(`OpenAI's cost report isn't available right now (status ${res.status}). Try again later.`);
    const body = await res.json() as { has_more?: boolean; next_page?: string | null };
    days.push(...parseCostBuckets(body));
    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
  }
  const merged = [...days.reduce((m, d) => m.set(d.date, (m.get(d.date) ?? 0) + d.usd), new Map<string, number>())].map(([date, usd]) => ({ date, usd })).sort((a, b) => b.date.localeCompare(a.date));
  await prisma.externalCache.upsert({ where: { key: CACHE_KEY }, create: { key: CACHE_KEY, value: merged, fetchedAt: now }, update: { value: merged, fetchedAt: now } });
  return { days: merged, fetchedAt: now };
}

export type CostCheckRow = { date: string; openAiUsd: number | null; estimateUsd: number; creditsSpent: number; costPerCredit: number | null; status: "ok" | "above-target" | "losing" | "no-credits" };

/**
 * Company page, AI tab: per day, the real OpenAI bill, Tripanize's own estimate from its usage log,
 * the credits people spent, and whether that day's AI cost stayed within what the credits cover.
 */
export async function openAiCostCheck(actorId: string, opts: { refresh?: boolean; fetcher?: typeof fetch; now?: Date } = {}) {
  await requireCompanyAdmin(actorId);
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - DAYS * 86400_000);
  let bill: { days: DailyCost[]; fetchedAt: Date } | null = null, error: string | null = null;
  if (openAiAdminConfigured()) {
    try { bill = await openAiDailyCosts(opts); } catch (e) { error = e instanceof Error ? e.message : "OpenAI's cost report isn't available right now."; }
  }
  const [spends, usage] = await Promise.all([
    prisma.creditEntry.findMany({ where: { kind: "spend", createdAt: { gte: since } }, select: { amount: true, createdAt: true } }),
    prisma.aiUsage.findMany({ where: { createdAt: { gte: since } }, select: { estimatedCostMicros: true, createdAt: true } }),
  ]);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const credits = new Map<string, number>(), estimate = new Map<string, number>();
  for (const s of spends) credits.set(day(s.createdAt), (credits.get(day(s.createdAt)) ?? 0) - s.amount);
  for (const u of usage) estimate.set(day(u.createdAt), (estimate.get(day(u.createdAt)) ?? 0) + Number(u.estimatedCostMicros ?? 0) / 1e6);
  const dates = new Set<string>([...credits.keys(), ...estimate.keys(), ...(bill?.days.map(d => d.date) ?? [])]);
  const rows: CostCheckRow[] = [...dates].sort((a, b) => b.localeCompare(a)).map(date => {
    const openAiUsd = bill ? bill.days.find(d => d.date === date)?.usd ?? 0 : null;
    const creditsSpent = credits.get(date) ?? 0;
    const cost = openAiUsd ?? estimate.get(date) ?? 0;
    const costPerCredit = creditsSpent > 0 ? cost / creditsSpent : null;
    const status = creditsSpent <= 0 ? "no-credits" : cost > creditsSpent * MIN_REVENUE_PER_CREDIT ? "losing" : cost > creditsSpent * TARGET_COST_PER_CREDIT ? "above-target" : "ok";
    return { date, openAiUsd, estimateUsd: Math.round((estimate.get(date) ?? 0) * 10000) / 10000, creditsSpent, costPerCredit, status };
  });
  const sum = (f: (r: CostCheckRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  return {
    configured: openAiAdminConfigured(), error, fetchedAt: bill?.fetchedAt ?? null, rows,
    totals: { openAiUsd: bill ? sum(r => r.openAiUsd ?? 0) : null, estimateUsd: sum(r => r.estimateUsd), creditsSpent: sum(r => r.creditsSpent) },
    targetCostPerCredit: TARGET_COST_PER_CREDIT, minRevenuePerCredit: MIN_REVENUE_PER_CREDIT,
  };
}
