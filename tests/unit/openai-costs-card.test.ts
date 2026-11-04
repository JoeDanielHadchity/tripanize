import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/app/actions/admin", () => ({ adminAction: async () => ({ ok: true, data: null }) }));
const { OpenAiCostCheck } = await import("@/app/company/openai-costs");

const base = { error: null, fetchedAt: null, targetCostPerCredit: 0.02, minRevenuePerCredit: 0.085 };
it("shows the bill, the per-credit cost and a status per day", () => {
  const html = renderToStaticMarkup(createElement(OpenAiCostCheck, { check: { ...base, configured: true, totals: { openAiUsd: 3.5, estimateUsd: 3.1, creditsSpent: 150 }, rows: [
    { date: "2030-06-10", openAiUsd: 2, estimateUsd: 1.8, creditsSpent: 10, costPerCredit: 0.2, status: "losing" },
    { date: "2030-06-09", openAiUsd: 1.5, estimateUsd: 1.3, creditsSpent: 140, costPerCredit: 0.0107, status: "ok" },
  ] } }));
  expect(html).toContain("OpenAI bill vs credits");
  expect(html).toContain("$3.50");
  expect(html).toContain("Losing money");
  expect(html).toContain("Within target");
  expect(html).toContain("Refresh from OpenAI");
});
it("explains how to connect the bill when no admin key is set", () => {
  const html = renderToStaticMarkup(createElement(OpenAiCostCheck, { check: { ...base, configured: false, totals: { openAiUsd: null, estimateUsd: 0, creditsSpent: 0 }, rows: [] } }));
  expect(html).toContain("OPENAI_ADMIN_KEY");
  expect(html).not.toContain("Refresh from OpenAI");
});
