import { currentRuntime, type PaddleConfig } from "@/server/cloudflare/runtime";

export function paddleConfigFromEnv(env: CloudflareEnv): PaddleConfig | undefined {
  if (env.PADDLE_ENVIRONMENT !== "sandbox" && env.PADDLE_ENVIRONMENT !== "live") return undefined;
  return {
    environment: env.PADDLE_ENVIRONMENT, apiKey: env.PADDLE_API_KEY ?? "",
    clientToken: env.PADDLE_CLIENT_TOKEN ?? "", webhookSecret: env.PADDLE_WEBHOOK_SECRET ?? "",
    checkoutEnabled: env.PADDLE_CHECKOUT_ENABLED === "true",
    prices: { 900: env.PADDLE_PRICE_900 ?? "", 1500: env.PADDLE_PRICE_1500 ?? "", 2500: env.PADDLE_PRICE_2500 ?? "", 600: env.PADDLE_PRICE_600 ?? "", 1000: env.PADDLE_PRICE_1000 ?? "", 1600: env.PADDLE_PRICE_1600 ?? "" },
  };
}
export function billingEnvironment() { return currentRuntime().paddle?.environment ?? "live"; }
export function checkoutAvailable() {
  const c = currentRuntime().paddle;
  return Boolean(c?.checkoutEnabled && c.apiKey && c.webhookSecret && /^(test|live)_[a-zA-Z0-9]{27}$/.test(c.clientToken) && c.clientToken.startsWith(c.environment === "live" ? "live_" : "test_") && [600, 900, 1000, 1500, 1600, 2500].every(n => /^pri_[a-z0-9]{26}$/.test(c.prices[n] ?? "")));
}
