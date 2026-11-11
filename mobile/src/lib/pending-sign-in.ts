import * as SecureStore from "expo-secure-store";

// A code sign-in (or email confirmation) in progress survives the app being closed while
// people switch to their email app: the code screen reopens with their email filled in.
const KEY = "tripanize-pending-sign-in";
const TTL = 10 * 60_000; // codes expire after 10 minutes

export type PendingSignIn = { email: string; purpose: "sign-in" | "verify"; sentAt: number };

export async function pendingSignIn(): Promise<PendingSignIn | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingSignIn;
    if (!p.email || Date.now() - p.sentAt > TTL) { await clearPendingSignIn(); return null; }
    return p;
  } catch { return null; }
}
export async function savePendingSignIn(p: Omit<PendingSignIn, "sentAt">) {
  try { await SecureStore.setItemAsync(KEY, JSON.stringify({ ...p, sentAt: Date.now() })); } catch { /* best effort */ }
}
export async function clearPendingSignIn() {
  try { await SecureStore.deleteItemAsync(KEY); } catch { /* best effort */ }
}
