import { z } from "zod";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { AppError } from "@/server/errors";

export const paddleTransaction = z.object({
  id: z.string().regex(/^txn_[a-z0-9]{26}$/), status: z.string(), currency_code: z.string(),
  subscription_id: z.string().nullable(), discount_id: z.string().nullable(),
  custom_data: z.object({ checkoutId: z.string(), tripId: z.string(), environment: z.enum(["live", "sandbox"]) }),
  items: z.array(z.object({ quantity: z.number(), price: z.object({ id: z.string(), billing_cycle: z.unknown().nullable(), unit_price: z.object({ amount: z.string(), currency_code: z.string() }) }) })),
  details: z.object({ totals: z.object({ subtotal: z.string(), discount: z.string() }) }).nullable(),
  adjustments: z.array(z.object({ action: z.string(), status: z.string() })).optional(),
});
export type PaddleTransaction = z.infer<typeof paddleTransaction>;

export async function paddleRequest(path: string, body?: object) {
  const c = currentRuntime().paddle;
  if (!c?.apiKey) throw new AppError("NOT_CONFIGURED", "Payments are being set up. Please try again later.");
  const base = c.environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json", "Paddle-Version": "1" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000), redirect: "error" });
  } catch { throw new AppError("UPSTREAM", "Paddle could not be reached. Your payment status will be checked before another checkout is created."); }
  if (!response.ok) {
    console.error("[billing] Paddle request failed", response.status);
    throw new AppError("UPSTREAM", "Paddle could not complete this request. Please try again later.");
  }
  const result: unknown = await response.json();
  return (result as { data: unknown }).data;
}
export async function fetchTransaction(id: string) {
  if (!/^txn_[a-z0-9]{26}$/.test(id)) throw new AppError("VALIDATION", "Invalid payment reference.");
  const parsed = paddleTransaction.safeParse(await paddleRequest(`/transactions/${id}?include=adjustments`));
  if (!parsed.success) throw new AppError("UPSTREAM", "The payment could not be verified. Please try again later.");
  // Paddle omits the included array when a transaction has no adjustments.
  return { ...parsed.data, adjustments: parsed.data.adjustments ?? [] };
}
