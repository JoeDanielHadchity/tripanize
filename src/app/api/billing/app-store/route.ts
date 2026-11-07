import { handleAppStoreNotification } from "@/server/billing/store";
import { AppError } from "@/server/errors";

/** App Store Server Notifications V2 (refunds and revocations). */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 256_000) return new Response("Payload too large", { status: 413 });
  let body: unknown;
  try { body = JSON.parse(await request.text()); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  try { return Response.json(await handleAppStoreNotification(body)); }
  catch (e) {
    if (e instanceof AppError && e.code === "VALIDATION") return Response.json({ error: e.message }, { status: 400 });
    console.error("[app-store] Notification processing failed");
    // A non-2xx response makes Apple retry the notification later.
    return Response.json({ error: "Temporarily unavailable." }, { status: 503 });
  }
}
