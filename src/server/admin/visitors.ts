import { prisma } from "@/server/db";
import { requireCompanyAdmin } from "./identity";

/**
 * Company page, Visitors tab: website traffic from Cloudflare, next to Tripanize's own sign-ups.
 * Reads Cloudflare's GraphQL Analytics API with a read-only token kept in the
 * CLOUDFLARE_ANALYTICS_TOKEN secret (Account Analytics: Read, Zone Analytics: Read).
 * Web Analytics counts real browser visits without cookies; zone traffic counts every request,
 * bots and files included. Neither identifies a visitor.
 */
const GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
const CACHE_MS = 10 * 60_000;
export const VISITOR_RANGES = [7, 30] as const;
export type VisitorRange = (typeof VISITOR_RANGES)[number];

function config() {
  return {
    token: process.env.CLOUDFLARE_ANALYTICS_TOKEN ?? "",
    account: process.env.CF_ACCOUNT_ID ?? "",
    zone: process.env.CF_ZONE_ID ?? "",
    site: process.env.CF_WEB_ANALYTICS_SITE_TAG ?? "",
  };
}
export function visitorsConfigured() { const c = config(); return Boolean(c.token && c.account && c.zone && c.site); }

export type Row = { key: string; views: number; visits: number };
export type DayRow = { date: string; views: number; visits: number; signups: number; requests: number | null; uniques: number | null };
export type VisitorReport = {
  days: DayRow[];
  totals: { views: number; visits: number; signups: number; requests: number | null; uniques: number | null };
  pages: Row[]; referrers: Row[]; countries: Row[]; devices: Row[]; browsers: Row[];
  fetchedAt: string;
  warning?: string;
};

const RUM = `query Visitors($account: string!, $zone: string!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!, $from: Date!, $to: Date!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      total: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 1) { count sum { visits } }
      days: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 40, orderBy: [date_ASC]) { count sum { visits } dimensions { key: date } }
      pages: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 60, orderBy: [count_DESC]) { count sum { visits } dimensions { key: requestPath } }
      referrers: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 15, orderBy: [count_DESC]) { count sum { visits } dimensions { key: refererHost } }
      countries: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 10, orderBy: [count_DESC]) { count sum { visits } dimensions { key: countryName } }
      devices: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 5, orderBy: [count_DESC]) { count sum { visits } dimensions { key: deviceType } }
      browsers: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 8, orderBy: [count_DESC]) { count sum { visits } dimensions { key: userAgentBrowser } }
    }
    zones(filter: { zoneTag: $zone }) {
      traffic: httpRequests1dGroups(filter: { date_geq: $from, date_leq: $to }, limit: 40, orderBy: [date_ASC]) { dimensions { date } sum { requests } uniq { uniques } }
    }
  }
}`;

type Group = { count?: number; sum?: { visits?: number }; dimensions?: { key?: string | null } };
/** Trip and invitation pages carry private IDs; group them so the list shows kinds of pages. */
export function pageGroup(path: string) {
  return (path || "/")
    .replace(/^\/trips\/(?!new\b)[^/]+/, "/trips/[trip]")
    .replace(/^\/invite\/[^/]+/, "/invite/[link]")
    .replace(/^\/trial\/[^/]+/, "/trial/[link]");
}
function merge(list: Row[], keyOf: (k: string) => string, limit: number) {
  const m = new Map<string, Row>();
  for (const r of list) { const key = keyOf(r.key), cur = m.get(key) ?? { key, views: 0, visits: 0 }; cur.views += r.views; cur.visits += r.visits; m.set(key, cur); }
  return [...m.values()].sort((a, b) => b.views - a.views).slice(0, limit);
}
/** Country codes from Cloudflare (SA, US) as names. */
function countryName(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return code || "Unknown";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code; } catch { return code; }
}
const OWN_HOSTS = /(^|\.)tripanize\.app$/i;
const rows = (groups: Group[] | undefined): Row[] => (groups ?? []).map(g => ({ key: g.dimensions?.key || "", views: g.count ?? 0, visits: g.sum?.visits ?? 0 }));

/** Turns Cloudflare's answer (and the sign-ups per day) into the report the tab shows. */
export function buildReport(data: unknown, from: string, to: string, signups: Map<string, number>, now = new Date()): VisitorReport {
  const viewer = (data as { viewer?: { accounts?: Record<string, Group[]>[]; zones?: { traffic?: { dimensions?: { date?: string }; sum?: { requests?: number }; uniq?: { uniques?: number } }[] }[] } })?.viewer;
  const acct = viewer?.accounts?.[0] ?? {};
  const traffic = new Map((viewer?.zones?.[0]?.traffic ?? []).map(t => [t.dimensions?.date ?? "", t]));
  const daily = new Map(rows(acct.days).map(r => [r.key, r]));
  const days: DayRow[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d = new Date(d.getTime() + 86400_000)) {
    const date = d.toISOString().slice(0, 10), r = daily.get(date), t = traffic.get(date);
    days.push({ date, views: r?.views ?? 0, visits: r?.visits ?? 0, signups: signups.get(date) ?? 0, requests: t ? t.sum?.requests ?? 0 : null, uniques: t ? t.uniq?.uniques ?? 0 : null });
  }
  const total = acct.total?.[0];
  const hasTraffic = traffic.size > 0;
  return {
    days,
    totals: {
      views: total?.count ?? 0, visits: total?.sum?.visits ?? 0,
      signups: days.reduce((s, d) => s + d.signups, 0),
      requests: hasTraffic ? days.reduce((s, d) => s + (d.requests ?? 0), 0) : null,
      // Cloudflare counts unique visitors per day; the period figure is the sum of daily uniques.
      uniques: hasTraffic ? days.reduce((s, d) => s + (d.uniques ?? 0), 0) : null,
    },
    pages: merge(rows(acct.pages), pageGroup, 10),
    // Clicks between Tripanize's own pages aren't a source.
    referrers: merge(rows(acct.referrers).filter(r => !OWN_HOSTS.test(r.key)), k => !k ? "Direct or unknown" : k.replace(/^(www|m|l|lm)\./, ""), 10),
    countries: rows(acct.countries).map(r => ({ ...r, key: countryName(r.key) })),
    devices: rows(acct.devices).map(r => ({ ...r, key: r.key || "Unknown" })),
    browsers: rows(acct.browsers).map(r => ({ ...r, key: r.key || "Unknown" })),
    fetchedAt: now.toISOString(),
  };
}

async function signupsByDay(since: Date) {
  const users = await prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } });
  const m = new Map<string, number>();
  for (const u of users) { const k = u.createdAt.toISOString().slice(0, 10); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

/** The last 7 or 30 days (UTC), cached for 10 minutes. Throws a readable message when Cloudflare refuses. */
export async function visitorReport(actorId: string, range: VisitorRange, opts: { refresh?: boolean; fetcher?: typeof fetch; now?: Date } = {}): Promise<VisitorReport> {
  await requireCompanyAdmin(actorId);
  const now = opts.now ?? new Date(), key = `cf-visitors:${range}`;
  if (!opts.refresh) {
    const cached = await prisma.externalCache.findUnique({ where: { key } });
    if (cached && now.getTime() - cached.fetchedAt.getTime() < CACHE_MS) return cached.value as VisitorReport;
  }
  const c = config();
  if (!visitorsConfigured()) throw new Error("Add the Cloudflare analytics token (CLOUDFLARE_ANALYTICS_TOKEN) to see visitors here.");
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (range - 1) * 86400_000);
  const from = fromDate.toISOString().slice(0, 10);
  const variables = { account: c.account, zone: c.zone, from, to, filter: { AND: [{ datetime_geq: fromDate.toISOString(), datetime_leq: now.toISOString() }, { siteTag: c.site }] } };
  const res = await (opts.fetcher ?? fetch)(GRAPHQL, { method: "POST", headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: RUM, variables }), signal: AbortSignal.timeout(15_000) });
  if (res.status === 401 || res.status === 403) throw new Error("Cloudflare refused the analytics token. Check that it has Account Analytics: Read and Zone Analytics: Read.");
  if (!res.ok) throw new Error(`Cloudflare's analytics aren't available right now (status ${res.status}). Try again later.`);
  const body = await res.json() as { data?: unknown; errors?: { message?: string }[] | null };
  const hasRum = Boolean((body.data as { viewer?: { accounts?: unknown[] } } | undefined)?.viewer?.accounts?.length);
  if (body.errors?.length && !hasRum) {
    const msg = body.errors[0]?.message ?? "unknown error";
    throw new Error(/auth|permission|not authorized/i.test(msg) ? "Cloudflare refused the analytics token. Check that it has Account Analytics: Read and Zone Analytics: Read." : `Cloudflare couldn't return the analytics: ${msg.slice(0, 200)}`);
  }
  const report = buildReport(body.data, from, to, await signupsByDay(fromDate), now);
  // Visits came back but zone traffic didn't (usually a token without Zone Analytics: Read).
  if (body.errors?.length) report.warning = `Total traffic isn't available: ${(body.errors[0]?.message ?? "Cloudflare returned an error").slice(0, 160)}. Check the token also has Zone Analytics: Read.`;
  await prisma.externalCache.upsert({ where: { key }, create: { key, value: report, fetchedAt: now }, update: { value: report, fetchedAt: now } });
  return report;
}
