import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/server/errors";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { reconcilePayment } from "./service";

export function verifyPaddleSignature(raw: string, header: string | null, secret: string, now = Date.now()) {
  if (!secret || !header || header.length > 2048) return false;
  const parts = header.split(";").map(p => p.trim());
  const ts = parts.find(p => p.startsWith("ts="))?.slice(3);
  if (!ts || !/^\d{10,11}$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 5) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:${raw}`).digest();
  return parts.filter(p => p.startsWith("h1=")).some(p => {
    const value = p.slice(3);
    return /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(expected, Buffer.from(value, "hex"));
  });
}
const eventSchema = z.object({ event_id: z.string(), event_type: z.string(), data: z.object({ id: z.string(), transaction_id: z.string().optional() }) });
export async function receivePaddleWebhook(raw: string, signature: string | null) {
  const secret = currentRuntime().paddle?.webhookSecret;
  if (!secret) throw new AppError("NOT_CONFIGURED", "Payments are not configured.");
  if (!verifyPaddleSignature(raw, signature, secret)) throw new AppError("UNAUTHENTICATED", "Invalid webhook signature.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new AppError("VALIDATION", "Invalid webhook payload."); }
  const event = eventSchema.safeParse(value);
  if (!event.success) throw new AppError("VALIDATION", "Invalid webhook payload.");
  const { event_type: type, data } = event.data;
  if (["transaction.completed", "transaction.canceled", "transaction.updated"].includes(type)) await reconcilePayment(data.id);
  else if (["adjustment.created", "adjustment.updated"].includes(type) && data.transaction_id) await reconcilePayment(data.transaction_id);
}
