import { currentRuntime, type PaddleConfig } from "@/server/cloudflare/runtime";

/**
 * Paddle settings for the environment PADDLE_ENVIRONMENT names. Sandbox keys and prices live beside the
 * live ones (PADDLE_SANDBOX_*), so switching the site between sandbox and live is one variable.
 */
export function paddleConfigFromEnv(env: CloudflareEnv): PaddleConfig | undefined {
  if (env.PADDLE_ENVIRONMENT !== "sandbox" && env.PADDLE_ENVIRONMENT !== "live") return undefined;
  const sandbox = env.PADDLE_ENVIRONMENT === "sandbox";
  const pick = (name: string) => (sandbox ? (env as unknown as Record<string, string | undefined>)[`PADDLE_SANDBOX_${name}`] : undefined) ?? (env as unknown as Record<string, string | undefined>)[`PADDLE_${name}`] ?? "";
  return {
    environment: env.PADDLE_ENVIRONMENT, apiKey: pick("API_KEY"), clientToken: pick("CLIENT_TOKEN"), webhookSecret: pick("WEBHOOK_SECRET"),
    checkoutEnabled: env.PADDLE_CHECKOUT_ENABLED === "true",
    prices: Object.fromEntries([900, 1500, 2500, 600, 1000, 1600].map(n => [n, pick(`PRICE_${n}`)])),
    creditPrices: Object.fromEntries([500, 1500, 2500, 5000].map(n => [n, pick(`CREDITS_PRICE_${n}`)])),
  };
}
export function billingEnvironment() { return currentRuntime().paddle?.environment ?? "live"; }
export function checkoutAvailable() {
  const c = currentRuntime().paddle;
  return Boolean(c?.checkoutEnabled && c.apiKey && c.webhookSecret && /^(test|live)_[a-zA-Z0-9]{27}$/.test(c.clientToken) && c.clientToken.startsWith(c.environment === "live" ? "live_" : "test_") && [1500].every(n => /^pri_[a-z0-9]{26}$/.test(c.prices[n] ?? "")));
}

/** Credit bundles can be bought once checkout is set up and every bundle has its Paddle price. */
export function creditCheckoutAvailable() {
  const c = currentRuntime().paddle;
  return Boolean(c?.checkoutEnabled && c.apiKey && c.webhookSecret && /^(test|live)_[a-zA-Z0-9]{27}$/.test(c.clientToken) && c.clientToken.startsWith(c.environment === "live" ? "live_" : "test_") && [500, 1500, 2500, 5000].every(n => /^pri_[a-z0-9]{26}$/.test(c.creditPrices?.[n] ?? "")));
}
