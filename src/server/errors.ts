export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "UPSTREAM"
  | "TIMEOUT";

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
    this.name = "AppError";
  }
}

export const conflictError = (what = "This item") =>
  new AppError("CONFLICT", `${what} was changed by another traveler since you opened it. Your edit was not saved — review the latest version and try again.`);

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; code: ErrorCode; error: string; details?: unknown };

/** Runs a server action body and converts known errors into a serializable result. */
export async function runAction<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; code: ErrorCode; error: string; details?: unknown }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, code: err.code, error: err.message, details: err.details };
    // Let Next.js redirects / notFound propagate.
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest?: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_")) throw err;
    console.error("[action] unexpected error", err instanceof Error ? err.message : err);
    return { ok: false, code: "UPSTREAM", error: "Something went wrong on our side. Nothing was changed — please try again." };
  }
}
