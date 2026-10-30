import { reserveAiUsage, captureAiUsage, finishAiUsage, type AiMetering } from "@/server/admin/ai-usage";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

/**
 * Server-side OpenAI integration (Responses API + strict structured outputs + optional web search).
 * The API key is read from the server environment only and is never sent to the browser or logged.
 */
export class AIError extends Error {
  constructor(
    public code: "NOT_CONFIGURED" | "AUTH" | "RATE_LIMITED" | "QUOTA" | "TIMEOUT" | "CANCELLED" | "UPSTREAM" | "UNREACHABLE" | "INVALID_RESPONSE" | "INCOMPLETE" | "REFUSED",
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AIError";
  }
}

export function aiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function aiModel() {
  return process.env.OPENAI_MODEL || "gpt-6.1-sol";
}

export function webSearchEnabled() {
  return process.env.OPENAI_WEB_SEARCH !== "false";
}

let client: OpenAI | null = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new AIError("NOT_CONFIGURED", "AI planning is not configured on this server (OPENAI_API_KEY is missing).");
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1 });
  return client;
}

export type StructuredResult<T> = { data: T; model: string; sources: string[]; usage: { input: number; output: number } | null };

type StructuredOptions<S extends z.ZodType> = {
  schema: S;
  name: string;
  instructions: string;
  input: string;
  content?: OpenAI.Responses.ResponseInput;
  webSearch?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputTokens?: number;
  metering?: AiMetering;
};

export async function generateStructured<S extends z.ZodType>(opts: StructuredOptions<S>): Promise<StructuredResult<z.infer<S>>> {
  const entry = await reserveAiUsage(opts.name, aiModel(), opts.metering);
  try {
    const result = await requestStructured(opts, entry.id);
    await finishAiUsage(entry.id, "SUCCEEDED");
    return result;
  } catch (error) {
    await finishAiUsage(entry.id, "FAILED", error instanceof AIError ? error.code : "UPSTREAM");
    throw error;
  }
}

async function requestStructured<S extends z.ZodType>(opts: StructuredOptions<S>, usageId: string): Promise<StructuredResult<z.infer<S>>> {
  const openai = getClient();
  const model = aiModel();
  const useSearch = Boolean(opts.webSearch && webSearchEnabled());
  let resp: OpenAI.Responses.Response;
  try {
    resp = await openai.responses.create(
      {
        model,
        reasoning: /^gpt-[56]/.test(model) ? { effort: "low" } : undefined,
        instructions: opts.instructions,
        input: opts.content ?? opts.input,
        tools: useSearch ? [{ type: "web_search" }] : undefined,
        include: useSearch ? ["web_search_call.action.sources"] : undefined,
        // Supported by the Responses API; keep compatibility with older SDK typings.
        ...(useSearch ? { max_tool_calls: 6 } : {}),
        text: { format: zodTextFormat(opts.schema, opts.name) },
        max_output_tokens: opts.maxOutputTokens ?? 24000,
        store: false,
      },
      { signal: opts.signal, timeout: opts.timeoutMs ?? 6 * 60_000,
        // Guided packing is retried by durable alarms, never nested SDK loops.
        ...(opts.name === "trip_packing" && opts.metering?.jobId ? { maxRetries: 0 } : {}) },
    );
  } catch (err) {
    // Operational metadata only: never log the prompt, response body or credentials.
    console.error("[ai] request failed", err instanceof OpenAI.APIError ? { name: opts.name, status: err.status, code: err.code, param: err.param, requestId: err.requestID } : { name: opts.name, type: err instanceof Error ? err.name : "unknown" });
    throw classify(err, opts.signal);
  }

  await captureAiUsage(usageId, resp);

  if (resp.status === "incomplete") {
    const why = resp.incomplete_details?.reason;
    throw new AIError("INCOMPLETE", why === "max_output_tokens" ? "The AI response was cut off before it finished (output too long)." : `The AI response was incomplete (${why ?? "unknown reason"}).`);
  }
  if (resp.status === "failed") throw new AIError("UPSTREAM", resp.error?.message ? `OpenAI reported an error: ${resp.error.message}` : "OpenAI reported a failed response.");

  for (const item of resp.output ?? []) {
    if (item.type === "message") {
      for (const c of item.content) if (c.type === "refusal") throw new AIError("REFUSED", "The AI declined to produce a plan for this request.");
    }
  }

  // output_text concatenates ALL assistant messages, including tool-progress
  // commentary. Only final-answer content belongs to the structured payload.
  const messages = (resp.output ?? []).filter(item => item.type === "message");
  const final = messages.filter(item => item.phase === "final_answer");
  const eligible = final.length ? final : messages.filter(item => item.phase == null);
  const text = eligible.flatMap(item => item.content.filter(c => c.type === "output_text").map(c => c.text)).join("\n");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("[ai] invalid JSON", { name: opts.name, responseId: resp.id, phases: messages.map(item => item.phase ?? "unmarked"), finalMessages: eligible.length });
    throw new AIError("INVALID_RESPONSE", "The AI returned a response that is not valid JSON.");
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    console.error("[ai] invalid structure", { name: opts.name, responseId: resp.id, issues: parsed.error.issues.slice(0, 8).map(i => ({ path: i.path.join("."), code: i.code })) });
    throw new AIError("INVALID_RESPONSE", `The AI response did not match the expected structure (${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")).join(", ")}).`);
  }

  const sources = new Set<string>();
  for (const item of resp.output ?? []) {
    if (item.type === "web_search_call") {
      const action = (item as unknown as { action?: { sources?: { url?: string }[] } }).action;
      for (const s of action?.sources ?? []) if (s.url) sources.add(s.url);
    }
    if (item.type === "message") {
      for (const c of item.content) if (c.type === "output_text") for (const a of c.annotations ?? []) if (a.type === "url_citation") sources.add(a.url);
    }
  }
  return {
    data: parsed.data,
    model: resp.model ?? model,
    sources: [...sources],
    usage: resp.usage ? { input: resp.usage.input_tokens, output: resp.usage.output_tokens } : null,
  };
}

function classify(err: unknown, signal?: AbortSignal): AIError {
  if (err instanceof AIError) return err;
  if (signal?.aborted) return new AIError("CANCELLED", "Generation was cancelled.");
  if (err instanceof OpenAI.APIConnectionTimeoutError) return new AIError("TIMEOUT", "OpenAI took too long to respond. Your existing itinerary is unchanged — try again, or plan fewer days at once.");
  if (err instanceof OpenAI.APIUserAbortError) return new AIError("CANCELLED", "Generation was cancelled.");
  if (err instanceof OpenAI.APIConnectionError) return new AIError("UNREACHABLE", "The server could not reach OpenAI (network error). Your existing itinerary is unchanged.");
  if (err instanceof OpenAI.APIError) {
    const status = err.status;
    const code = (err as { code?: string | null }).code;
    if (status === 401 || status === 403) return new AIError("AUTH", "The server's OpenAI API key was rejected. An administrator needs to update it.");
    if (status === 429 && code === "credit_balance_exhausted") return new AIError("QUOTA", "Tripanize's AI service has run out of credit. An administrator needs to replenish it before AI planning can continue.");
    if (status === 429 && (/quota|billing|spend|usage_limit/.test(code ?? "") || /exceeded your current quota|billing hard limit|credit balance/i.test(err.message))) return new AIError("QUOTA", "The app's AI account has reached its credit or spending limit. An administrator needs to check API billing and limits.");
    if (status === 429 && /request too large|reduce (?:the )?(?:length|size|tokens)/i.test(err.message)) return new AIError("UPSTREAM", "This AI request exceeds the account's token limit. An administrator needs to check the model's API limits.");
    if (status === 429 && ["rate_limit_exceeded", "slow_down"].includes(code ?? "")) return new AIError("RATE_LIMITED", "AI preparation is temporarily busy. Please wait before retrying.", retryDelay(err.headers));
    if (status === 429) return new AIError("UPSTREAM", "The AI provider rejected this request. An administrator needs to check the API error and account limits.");
    if (status === 400) return new AIError("UPSTREAM", `OpenAI rejected the request: ${err.message.slice(0, 200)}`);
    return new AIError("UPSTREAM", `OpenAI returned an error (HTTP ${status ?? "?"}). Please try again.`);
  }
  return new AIError("UPSTREAM", "Unexpected error while contacting OpenAI.");
}

function retryDelay(headers?: Headers): number | undefined {
  const milliseconds = headers?.get("retry-after-ms");
  if (milliseconds && /^\d+(\.\d+)?$/.test(milliseconds)) return Number(milliseconds);
  const value = headers?.get("retry-after");
  if (!value) return undefined;
  const delay = /^\d+(\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay >= 0 ? delay : undefined;
}
