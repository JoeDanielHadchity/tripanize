import { receivePaddleWebhook } from "@/server/billing/webhook";
import { AppError } from "@/server/errors";

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 512_000) return new Response("Payload too large", { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response("Missing payload", { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 512_000) { await reader.cancel(); return new Response("Payload too large", { status: 413 }); }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try { await receivePaddleWebhook(raw, request.headers.get("paddle-signature")); return Response.json({ received: true }); }
  catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.code === "UNAUTHENTICATED" ? 401 : e.code === "VALIDATION" ? 400 : 503 });
    console.error("[billing] Webhook processing failed");
    return Response.json({ error: "Payment verification unavailable. Please retry." }, { status: 503 });
  }
}
