import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const API_URL = Platform.OS === "web" && typeof window !== "undefined"
  ? window.location.origin : (process.env.EXPO_PUBLIC_API_URL ?? "https://www.tripanize.app").replace(/\/$/, "");

export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { timeout: 20_000 },
  plugins: [emailOTPClient(), expoClient({ scheme: "tripanize", storagePrefix: "tripanize-mobile", storage: SecureStore, disableCache: true })],
});

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!path.startsWith("/api/mobile/")) throw new Error("Invalid mobile API path.");
  const cookie = Platform.OS === "web" ? "" : await authClient.getCookie();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 20_000);
  try {
    const response = await fetch(API_URL + path, { signal: controller.signal, headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) }, credentials: Platform.OS === "web" ? "include" : "omit" });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) void authClient.signOut();
      throw new ApiError(data?.error ?? "Could not connect. Please try again.", response.status);
    }
    if (data === null) throw new ApiError("Could not load this page. Please try again.", 502);
    return data as T;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}

export const photo = (path: string) => API_URL + path;
