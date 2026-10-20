import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { AppError } from "@/server/errors";

/** Wraps a route handler: requires a session and maps AppErrors to HTTP responses. */
export async function withUser(fn: (userId: string) => Promise<Response>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    return await fn(session.user.id);
  } catch (e) {
    if (e instanceof AppError) {
      const status = { NOT_FOUND: 404, FORBIDDEN: 403, VALIDATION: 400, CONFLICT: 409, RATE_LIMITED: 429, NOT_CONFIGURED: 503, UNAUTHENTICATED: 401, UPSTREAM: 502, TIMEOUT: 504 }[e.code];
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("[api]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export const noStore = { "Cache-Control": "private, no-store" };
