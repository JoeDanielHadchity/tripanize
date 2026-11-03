import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";

export type AiMetering = { userId?: string | null; tripId?: string | null; jobId?: string | null };
export async function reserveAiUsage(kind: string, model: string, context?: AiMetering) {
  return prisma.$transaction(async db => {
    const settings = await db.platformSettings.findUnique({ where: { id: "platform" } });
    if (settings?.aiPaused) throw new AppError("NOT_CONFIGURED", "AI tools are temporarily paused. Please try again later. Manual planning is available.");
    if (context?.userId) {
      const user = await db.user.findUnique({ where: { id: context.userId }, select: { suspendedAt: true } });
      if (!user || user.suspendedAt) throw new AppError("FORBIDDEN", "This account cannot request AI tools.");
    }
    const since = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    if (settings?.aiDailyLimit && await db.aiUsage.count({ where: { createdAt: { gte: since } } }) >= settings.aiDailyLimit) throw new AppError("RATE_LIMITED", "AI capacity has been reached for today. Please try again tomorrow.");
    if (context?.userId && settings?.aiUserDailyLimit && await db.aiUsage.count({ where: { userId: context.userId, createdAt: { gte: since } } }) >= settings.aiUserDailyLimit) throw new AppError("RATE_LIMITED", "You have reached today's AI request limit. Please try again tomorrow.");
    return db.aiUsage.create({ data: { kind, model, userId: context?.userId, tripId: context?.tripId, jobId: context?.jobId } });
  });
}
/** Cached input is billed at a fraction of the input rate (5-10% for current
 * OpenAI models); 10% keeps the estimate on the safe, slightly high side. */
const CACHED_INPUT_SHARE = 0.1;
export async function captureAiUsage(id: string, response: { model: string; usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } | null } | null; output?: { type: string }[] }) {
  const settings = await prisma.platformSettings.findUnique({ where: { id: "platform" } });
  const searches = response.output?.filter(o => o.type === "web_search_call").length ?? 0;
  const match = settings?.pricingModel && (response.model === settings.pricingModel || response.model.startsWith(settings.pricingModel + "-"));
  const known = Boolean(response.usage && match && settings?.inputUsdPerMillion != null && settings?.outputUsdPerMillion != null && (!searches || settings.searchUsdPerThousand != null));
  const cached = Math.min(response.usage?.input_tokens_details?.cached_tokens ?? 0, response.usage?.input_tokens ?? 0);
  const estimate = known ? Math.ceil((response.usage!.input_tokens - cached + cached * CACHED_INPUT_SHARE) * settings!.inputUsdPerMillion! + response.usage!.output_tokens * settings!.outputUsdPerMillion! + searches * (settings!.searchUsdPerThousand ?? 0) * 1000) : null;
  await prisma.aiUsage.update({ where: { id }, data: { model: response.model, inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, searchCalls: searches, estimatedCostMicros: estimate !== null && Number.isSafeInteger(estimate) && estimate <= 2147483647 ? estimate : null } });
}
export async function finishAiUsage(id: string, status: "SUCCEEDED" | "FAILED", errorCode?: string) {
  await prisma.aiUsage.update({ where: { id }, data: { status, errorCode: errorCode?.slice(0, 60), finishedAt: new Date() } });
}
