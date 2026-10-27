import { getWorkerSession } from "@/server/auth/auth";
import { AppError } from "@/server/errors";
import { getMobileUser } from "./service";

/** Native clients send the same signed session cookie as the website. Every
 * response, including errors, is private; no public cache contains trip data. */
export async function mobileRead(request: Request, read: (userId: string) => Promise<unknown>) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const session = await getWorkerSession(request.headers);
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
    await getMobileUser(session.user.id);
    return Response.json(await read(session.user.id), { headers });
  } catch (error) {
    if (error instanceof AppError) {
      const statuses = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, CONFLICT: 409, RATE_LIMITED: 429, NOT_CONFIGURED: 503, UPSTREAM: 502, TIMEOUT: 504 };
      return Response.json({ error: error.message, code: error.code }, { status: statuses[error.code], headers });
    }
    console.error("[mobile-api]", error instanceof Error ? error.message : "Unexpected error");
    return Response.json({ error: "Could not load your trip. Please try again." }, { status: 500, headers });
  }
}
