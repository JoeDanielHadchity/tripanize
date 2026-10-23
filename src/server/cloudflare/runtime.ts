import { AsyncLocalStorage } from "node:async_hooks";
import type { AppDatabase } from "@/server/db";

export type PaddleConfig = { environment: "sandbox" | "live"; apiKey: string; clientToken: string; webhookSecret: string; prices: Record<number, string>; checkoutEnabled: boolean };

export type AccountModeContext = { userId: string; sessionId?: string; normal: boolean };

export type AppRuntime = { accountMode?: AccountModeContext; database: AppDatabase; files?: R2Bucket; assets?: Fetcher; authSecret: string; appUrl?: string; supportEmail?: string; companyAdminEmail?: string; planAccessEnabled?: boolean; paddle?: PaddleConfig; wakeAi?: () => Promise<void>; wakeNotifications?: () => Promise<void>; wakeLocationExpiry?: (at: number) => Promise<void> };
const key = Symbol.for("tripanize.cloudflare.runtime");
// Framework route bundles must share the request context of their Durable Object.
const root = globalThis as typeof globalThis & { [key]?: AsyncLocalStorage<AppRuntime> };
export const appRuntime = root[key] ??= new AsyncLocalStorage<AppRuntime>();
let testRuntime: AppRuntime | undefined;
export function currentRuntime(): AppRuntime {
  const runtime = appRuntime.getStore() ?? testRuntime;
  if (!runtime) throw new Error("Tripanize needs its Cloudflare runtime. Start it with npm run preview.");
  return runtime;
}
export function setTestRuntime(runtime: AppRuntime) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test runtime is restricted to tests.");
  testRuntime = runtime;
}

/** Set only from an authenticated server session, or a server-created job snapshot. */
export function normalUserMode(userId?: string) {
  const mode = currentRuntime().accountMode;
  return Boolean(mode?.normal && (!userId || mode.userId === userId));
}
