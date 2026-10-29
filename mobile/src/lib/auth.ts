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
export async function apiResponse(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
  if (!path.startsWith("/api/mobile/")) throw new Error("Invalid mobile API path.");
  const cookie = Platform.OS === "web" ? "" : await authClient.getCookie();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, init.method === "POST" ? 120_000 : 30_000);
  try {
    const response = await fetch(API_URL + path, { ...init, signal: controller.signal, headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(init.method && init.method !== "GET" && Platform.OS !== "web" ? { Origin: "tripanize://" } : {}), ...init.headers }, credentials: Platform.OS === "web" ? "include" : "omit" });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      if (response.status === 401) void authClient.signOut();
      throw new ApiError(data?.error ?? "Could not connect. Please try again.", response.status);
    }
    return response;
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}
export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await apiResponse(path, {}, signal);
  return response.json() as Promise<T>;
}
export async function post<T>(path: string, input: unknown): Promise<T> {
  const response = await apiResponse(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  return response.json() as Promise<T>;
}

export const photo = (path: string) => API_URL + path;
