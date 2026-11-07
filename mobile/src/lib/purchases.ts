import { Platform } from "react-native";
import type * as IAP from "expo-iap";
import { post } from "./auth";

/** Google Play Billing / StoreKit purchase of Premium for one trip.
 * The server creates an intent first; its id travels inside the store purchase
 * (obfuscatedProfileId on Android, appAccountToken on iOS) and the server re-reads
 * the purchase from Google or Apple before granting anything. */
type Store = "google_play" | "app_store";
type Intent = { intentId: string; productId: string; accountId: string };
type Complete = { status: "completed" | "pending"; tripId: string };
export type PurchaseOutcome = { status: "completed" | "pending" | "cancelled"; price?: string };

const store = (): Store | null => Platform.OS === "android" ? "google_play" : Platform.OS === "ios" ? "app_store" : null;
// Loaded lazily: the module is native-only and the web preview must not import it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const iap = () => require("expo-iap") as typeof IAP;
let connected: Promise<boolean> | null = null;
const connect = () => (connected ??= iap().initConnection().catch(error => { connected = null; throw error; }));

export const purchasesSupported = () => store() !== null;

function intentOf(purchase: IAP.Purchase): string | null {
  const id = Platform.OS === "android" ? (purchase as IAP.PurchaseAndroid).obfuscatedProfileIdAndroid : (purchase as IAP.PurchaseIOS).appAccountToken;
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id.toLowerCase() : null;
}

async function verify(purchase: IAP.Purchase, intentId: string): Promise<Complete> {
  const kind = store()!;
  const proof = kind === "google_play" ? { purchaseToken: purchase.purchaseToken } : { transactionId: (purchase as IAP.PurchaseIOS).transactionId };
  const result = await post<Complete>("/api/mobile/purchases", { op: "complete", store: kind, intentId, productId: purchase.productId, ...proof });
  // Only finish after the server saved it; an unfinished purchase is redelivered.
  if (result.status === "completed") await iap().finishTransaction({ purchase, isConsumable: true }).catch(() => undefined);
  return result;
}

export async function buyTripPremium(tripId: string): Promise<PurchaseOutcome> {
  const kind = store();
  if (!kind) throw new Error("Purchases are available in the Tripanize app for Android and iPhone.");
  const intent = await post<Intent>("/api/mobile/purchases", { op: "begin", tripId, store: kind });
  await connect();
  const { fetchProducts, requestPurchase, purchaseUpdatedListener, purchaseErrorListener, ErrorCode } = iap();
  const products = await fetchProducts({ skus: [intent.productId], type: "in-app" }) as IAP.Product[] | null;
  const product = products?.find(p => p.id === intent.productId);
  if (!product) throw new Error("Premium is not available in your store yet. Please try again later.");
  const purchase = await new Promise<IAP.Purchase | null>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => { if (settled) return; settled = true; updated.remove(); failed.remove(); clearTimeout(timer); fn(); };
    const updated = purchaseUpdatedListener(p => { if (p.productId === intent.productId && intentOf(p) === intent.intentId) done(() => resolve(p)); });
    const failed = purchaseErrorListener(e => done(() => e.code === ErrorCode.UserCancelled ? resolve(null) : reject(new Error(e.message || "The purchase did not complete."))));
    const timer = setTimeout(() => done(() => reject(new Error("The store did not respond. If you were charged, Premium will appear shortly."))), 10 * 60_000);
    requestPurchase({ type: "in-app", request: {
      google: { skus: [intent.productId], obfuscatedAccountId: intent.accountId, obfuscatedProfileId: intent.intentId },
      apple: { sku: intent.productId, appAccountToken: intent.intentId },
    } }).then(result => {
      const list = Array.isArray(result) ? result : result ? [result] : [];
      const match = list.find(p => p.productId === intent.productId && intentOf(p) === intent.intentId);
      if (match) done(() => resolve(match));
    }).catch((e: { code?: string; message?: string }) => done(() => e?.code === ErrorCode.UserCancelled ? resolve(null) : reject(new Error(e?.message || "The purchase did not complete."))));
  });
  if (!purchase) return { status: "cancelled" };
  const result = await verify(purchase, intent.intentId);
  return { status: result.status, price: product.displayPrice };
}

/** Applies purchases that were paid but not confirmed (app closed, network
 * dropped). Runs quietly at start-up; failures are retried next time. */
export async function recoverPurchases(): Promise<number> {
  if (!store()) return 0;
  try {
    await connect();
    const purchases = await iap().getAvailablePurchases();
    let applied = 0;
    for (const purchase of purchases) {
      const intentId = intentOf(purchase);
      if (!intentId) continue;
      try { if ((await verify(purchase, intentId)).status === "completed") applied++; } catch { /* retry on next launch */ }
    }
    return applied;
  } catch { return 0; }
}
