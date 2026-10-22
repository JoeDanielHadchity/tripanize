import { submitSupport } from "@/server/support/service";
import { AppError } from "@/server/errors";

const maxBytes = 20_000;
const response = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return response({ error: "Please send your message from the Tripanize contact page." }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return response({ error: "Invalid message format." }, 400);
  if (Number(request.headers.get("content-length")) > maxBytes) return response({ error: "Your message is too long." }, 413);
  const reader = request.body?.getReader();
  if (!reader) return response({ error: "Please enter a message." }, 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return response({ error: "Your message is too long." }, 413); }
      chunks.push(value);
    }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return response({ error: "Invalid message format." }, 400); }
    const result = await submitSupport(input, request.headers.get("cf-connecting-ip") ?? "unknown");
    return response({ sent: true, ...result });
  } catch (error) {
    if (error instanceof AppError) return response({ error: error.message }, error.code === "RATE_LIMITED" ? 429 : error.code === "VALIDATION" ? 400 : 503);
    // Never log the visitor's message, address or provider credentials.
    console.error("[support] Message processing failed");
    return response({ error: "Support is temporarily unavailable. Please try again later." }, 503);
  }
}
