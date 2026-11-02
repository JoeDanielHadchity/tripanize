import { beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { captureAiUsage } from "@/server/admin/ai-usage";
import { resetDb } from "./helpers";
beforeEach(resetDb);

it("prices cached input at the discounted share instead of the full input rate", async () => {
  await prisma.platformSettings.upsert({ where: { id: "platform" }, create: { id: "platform", pricingModel: "gpt-6.1-sol", inputUsdPerMillion: 2, outputUsdPerMillion: 10, searchUsdPerThousand: 10 }, update: {} });
  const row = await prisma.aiUsage.create({ data: { kind: "fixture", model: "gpt-6.1-sol" } });
  // 1M input tokens of which 800k cached, 100k output, 2 searches:
  // 200k × $2 + 800k × $0.20 + 100k × $10 + 2 × $0.01 = $0.40 + $0.16 + $1.00 + $0.02 = $1.58
  await captureAiUsage(row.id, { model: "gpt-6.1-sol-2026-09-29", usage: { input_tokens: 1_000_000, output_tokens: 100_000, input_tokens_details: { cached_tokens: 800_000 } }, output: [{ type: "web_search_call" }, { type: "web_search_call" }, { type: "message" }] });
  expect((await prisma.aiUsage.findUniqueOrThrow({ where: { id: row.id } })).estimatedCostMicros).toBe(1_580_000);
});
