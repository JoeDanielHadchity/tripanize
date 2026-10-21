import { AsyncLocalStorage } from "node:async_hooks";
import type { AppDatabase } from "@/server/db";

export type AppRuntime = { database: AppDatabase; files?: R2Bucket; assets?: Fetcher; authSecret: string; appUrl?: string };
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
