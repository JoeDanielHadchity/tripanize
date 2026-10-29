import { getWorkerSession } from "@/server/auth/auth";
import { AppError } from "@/server/errors";
import { getMobileUser } from "./service";
import { rateLimit } from "@/server/ratelimit";
import { ZodError } from "zod";

/** Native clients send the same signed session cookie as the website. Every
 * response, including errors, is private; no public cache contains trip data. */
export async function mobileRead(request: Request, read: (userId: string, sessionId: string) => Promise<unknown>) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const session = await getWorkerSession(request.headers);
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
    await getMobileUser(session.user.id);
    const result = await read(session.user.id, session.session.id);
    if (result instanceof Response) { for (const [key, value] of Object.entries(headers)) result.headers.set(key, value); return result; }
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: error.issues.map(i => i.message).join(" · "), code: "VALIDATION" }, { status: 400, headers });
    if (error instanceof AppError) {
      const statuses = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, CONFLICT: 409, RATE_LIMITED: 429, NOT_CONFIGURED: 503, UPSTREAM: 502, TIMEOUT: 504 };
      return Response.json({ error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) }, { status: statuses[error.code], headers });
    }
    console.error("[mobile-api]", error instanceof Error ? error.message : "Unexpected error");
    return Response.json({ error: "Could not load your trip. Please try again." }, { status: 500, headers });
  }
}

/** Browser previews must pass same-origin CSRF checks. Native requests carry
 * an explicit branded origin and a signed cookie from SecureStore. */
export function mobileOriginAllowed(request: Request) {
  const origin = request.headers.get("Origin");
  return origin === new URL(request.url).origin || origin === "tripanize://";
}
export async function mobileWrite(request: Request, write: (userId: string, input: unknown, sessionId: string) => Promise<unknown>) {
  return mobileRead(request, async (userId, sessionId) => {
    if (!mobileOriginAllowed(request)) throw new AppError("FORBIDDEN", "Request origin is not allowed.");
    if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new AppError("VALIDATION", "Submit JSON.");
    const limit = 96 * 1024;
    if (Number(request.headers.get("Content-Length") ?? 0) > limit) throw new AppError("VALIDATION", "Request is too large.");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("VALIDATION", "Submit a request.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new AppError("VALIDATION", "Request is too large."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    let input: unknown;
    try { input = JSON.parse(new TextDecoder().decode(data)); } catch { throw new AppError("VALIDATION", "Invalid JSON."); }
    await rateLimit(`mobile-write:${userId}`, 600, 3600);
    return write(userId, input, sessionId);
  });
}
