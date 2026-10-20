import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

export class UpstreamError extends Error {
  constructor(public service: string, message: string) {
    super(`${service}: ${message}`);
  }
}

const UA = `Roam/1.0 (+${process.env.APP_URL ?? "https://localhost"})`;

// After a network failure, skip a host for a few minutes so pages stay fast while a service is down.
const downUntil = new Map<string, number>();
const COOLDOWN_MS = 5 * 60_000;

export async function fetchJson<T>(service: string, url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const host = new URL(url).host;
  if ((downUntil.get(host) ?? 0) > Date.now()) throw new UpstreamError(service, "temporarily unavailable");
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(init.timeoutMs ?? 10000),
    });
  } catch (err) {
    downUntil.set(host, Date.now() + COOLDOWN_MS);
    throw new UpstreamError(service, err instanceof Error && err.name === "TimeoutError" ? "timed out" : "unreachable");
  }
  if (res.status >= 500 || res.status === 429) downUntil.set(host, Date.now() + 60_000);
  if (!res.ok) throw new UpstreamError(service, `HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Read-through cache in Postgres. Returns stale data (flagged) if the refresh fails. */
export async function cached<T>(key: string, maxAgeSec: number, load: () => Promise<T>): Promise<{ value: T; fetchedAt: Date; stale: boolean }> {
  const hit = await prisma.externalCache.findUnique({ where: { key } });
  if (hit && Date.now() - hit.fetchedAt.getTime() < maxAgeSec * 1000) {
    return { value: hit.value as T, fetchedAt: hit.fetchedAt, stale: false };
  }
  try {
    const value = await load();
    const row = await prisma.externalCache.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue, fetchedAt: new Date() },
    });
    return { value, fetchedAt: row.fetchedAt, stale: false };
  } catch (err) {
    if (hit) return { value: hit.value as T, fetchedAt: hit.fetchedAt, stale: true };
    throw err;
  }
}
