import { createHash } from "node:crypto";
import { errorReportInput, recordError } from "@/server/errors/reports";
import { rateLimit } from "@/server/ratelimit";
import { getWorkerSession } from "@/server/auth/auth";

const maxBytes = 12_000;
const ok = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/** Crash reports from the website and the app. Always answers 204 so a broken page never retries
 * in a loop; bad or excessive reports are dropped quietly. */
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > maxBytes) return ok();
    const text = await request.text();
    if (text.length > maxBytes) return ok();
    const parsed = errorReportInput.safeParse(JSON.parse(text));
    if (!parsed.success) return ok();
    const ip = createHash("sha256").update(request.headers.get("cf-connecting-ip") ?? "unknown").digest("hex").slice(0, 16);
    await rateLimit(`errors:ip:${ip}`, 30, 3600);
    await rateLimit("errors:all", 600, 3600);
    const session = await getWorkerSession(request.headers).catch(() => null);
    await recordError({ ...parsed.data, userId: session?.user.id ?? null });
  } catch {
    // Rate limited, invalid JSON or storage trouble: drop it.
  }
  return ok();
}
