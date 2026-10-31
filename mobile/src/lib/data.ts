import { useCallback, useEffect, useState } from "react";
import { api, authClient, ApiError } from "./auth";

/** Last good response per account and path, so revisiting a screen is instant.
 * Keys include the account id; a different sign-in never sees another's data. */
const cache = new Map<string, unknown>();
let cacheOwner: string | undefined;
function cached<T>(owner: string | undefined, path: string): T | null {
  if (!owner || owner !== cacheOwner) return null;
  return (cache.get(path) as T | undefined) ?? null;
}
function remember(owner: string, path: string, data: unknown) {
  if (owner !== cacheOwner) { cache.clear(); cacheOwner = owner; }
  cache.set(path, data);
  if (cache.size > 80) cache.delete(cache.keys().next().value!);
}
export function clearApiCache() { cache.clear(); cacheOwner = undefined; }

/** Cancel old reads on navigation/sign-out so another account never sees them.
 * `data` is the fresh (or cached) response for this path; `stale` is the last
 * response for a previous path, which a screen may keep on screen while loading. */
export function useApi<T>(path: string) {
  const { data: session } = authClient.useSession();
  const owner = session?.user.id;
  const [cycle, setCycle] = useState(0);
  const [result, setResult] = useState<{ owner: string; path: string; cycle: number; data: T | null; error: string | null; status?: number } | null>(null);
  const reload = useCallback(() => setCycle(value => value + 1), []);
  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    void api<T>(path, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      remember(owner, path, data);
      setResult({ owner, path, cycle, data, error: null });
    }).catch(e => {
      if (!controller.signal.aborted) setResult({ owner, path, cycle, data: null, error: e instanceof Error ? e.message : "Please try again.", status: e instanceof ApiError ? e.status : undefined });
    });
    return () => controller.abort();
  }, [owner, path, cycle]);
  const current = Boolean(result && result.owner === owner && result.path === path);
  const data = current && result?.data ? result.data : current && result?.error ? null : cached<T>(owner, path);
  const stale = !current && result && result.owner === owner && result.data ? { path: result.path, data: result.data } : null;
  return { data, stale, error: current && result?.cycle === cycle ? result.error : null,
    loading: Boolean(owner && (!current || result?.cycle !== cycle)), status: current ? result?.status : undefined, reload };
}

export const dayLabel = (date: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) => new Date(date + "T12:00:00Z").toLocaleDateString("en", { timeZone: "UTC", ...options });
export const tripDates = (start: string | null, end: string | null) => start && end ? `${dayLabel(start)} – ${dayLabel(end, { month: "short", day: "numeric", year: "numeric" })}` : "Dates to come";
export const roleLabel = (role: string) => role === "OWNER" ? "Organizer" : role === "COLLABORATOR" ? "Editor" : "Viewer";
