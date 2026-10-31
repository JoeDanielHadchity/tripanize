import type { StoreConfig } from "@/server/cloudflare/runtime";

/** Store billing stays off until STORE_BILLING_ENABLED is "true" and at least
 * one store has complete server credentials. */
export function storeConfigFromEnv(env: CloudflareEnv): StoreConfig | undefined {
  if (env.STORE_BILLING_ENABLED !== "true") return undefined;
  let google: StoreConfig["google"];
  try {
    const account = env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ? JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) as { client_email?: string; private_key?: string; token_uri?: string } : null;
    if (account?.client_email && account.private_key) google = { packageName: env.GOOGLE_PLAY_PACKAGE || "app.tripanize.mobile", clientEmail: account.client_email, privateKey: account.private_key, tokenUri: account.token_uri || "https://oauth2.googleapis.com/token" };
  } catch { console.error("[store-config] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON."); }
  const apple = env.APPLE_IAP_KEY_ID && env.APPLE_IAP_ISSUER_ID && env.APPLE_IAP_PRIVATE_KEY
    ? { bundleId: env.APPLE_BUNDLE_ID || "app.tripanize.mobile", keyId: env.APPLE_IAP_KEY_ID, issuerId: env.APPLE_IAP_ISSUER_ID, privateKey: env.APPLE_IAP_PRIVATE_KEY.replace(/\\n/g, "\n"), ...(Number(env.APPLE_APP_ID) ? { appAppleId: Number(env.APPLE_APP_ID) } : {}) }
    : undefined;
  if (!google && !apple) return undefined;
  return { productId: env.STORE_PRODUCT_ID || "tripanize_premium_trip", google, apple, acceptSandbox: env.STORE_ACCEPT_SANDBOX !== "false" };
}
