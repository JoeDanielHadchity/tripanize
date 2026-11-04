import { expect, it } from "vitest";
import { buildReport } from "@/server/admin/visitors";

it("turns Cloudflare's analytics into a day-by-day report with sign-ups", () => {
  const data = { viewer: {
    accounts: [{
      total: [{ count: 120, sum: { visits: 40 } }],
      days: [{ count: 70, sum: { visits: 25 }, dimensions: { key: "2026-11-03" } }, { count: 50, sum: { visits: 15 }, dimensions: { key: "2026-11-04" } }],
      pages: [{ count: 80, sum: { visits: 30 }, dimensions: { key: "/" } }, { count: 40, sum: { visits: 12 }, dimensions: { key: "" } }],
      referrers: [{ count: 60, sum: { visits: 20 }, dimensions: { key: "" } }, { count: 30, sum: { visits: 10 }, dimensions: { key: "l.instagram.com" } }],
      countries: [], devices: [], browsers: [],
    }],
    zones: [{ traffic: [{ dimensions: { date: "2026-11-04" }, sum: { requests: 900 }, uniq: { uniques: 70 } }] }],
  } };
  const r = buildReport(data, "2026-11-02", "2026-11-04", new Map([["2026-11-04", 3]]), new Date("2026-11-04T12:00:00Z"));
  expect(r.days.map(d => [d.date, d.visits, d.views, d.signups, d.requests])).toEqual([
    ["2026-11-02", 0, 0, 0, null], ["2026-11-03", 25, 70, 0, null], ["2026-11-04", 15, 50, 3, 900],
  ]);
  expect(r.totals).toEqual({ views: 120, visits: 40, signups: 3, requests: 900, uniques: 70 });
  expect(r.pages[1].key).toBe("/");
  expect(r.referrers.map(x => x.key)).toEqual(["Direct or unknown", "l.instagram.com"]);
});

it("shows no traffic totals when Cloudflare returned none", () => {
  const r = buildReport({ viewer: { accounts: [{ total: [{ count: 0, sum: { visits: 0 } }] }], zones: [] } }, "2026-11-04", "2026-11-04", new Map());
  expect(r.totals.requests).toBeNull();
  expect(r.days).toHaveLength(1);
});
