import { useCallback, useEffect, useState } from "react";
import { api, authClient } from "./auth";

/** Cancel old reads on navigation/sign-out so another account never sees them. */
export function useApi<T>(path: string) {
  const { data: session } = authClient.useSession();
  const owner = session?.user.id;
  const [cycle, setCycle] = useState(0);
  const [result, setResult] = useState<{ owner: string; path: string; cycle: number; data: T | null; error: string | null } | null>(null);
  const reload = useCallback(() => setCycle(value => value + 1), []);
  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    void api<T>(path, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ owner, path, cycle, data, error: null });
    }).catch(e => {
      if (!controller.signal.aborted) setResult({ owner, path, cycle, data: null, error: e instanceof Error ? e.message : "Please try again." });
    });
    return () => controller.abort();
  }, [owner, path, cycle]);
  const current = result?.owner === owner && result?.path === path;
  return { data: current ? result.data : null, error: current && result.cycle === cycle ? result.error : null,
    loading: Boolean(owner && (!current || result.cycle !== cycle)), reload };
}

export const dayLabel = (date: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) => new Date(date + "T12:00:00Z").toLocaleDateString("en", { timeZone: "UTC", ...options });
export const tripDates = (start: string | null, end: string | null) => start && end ? `${dayLabel(start)} – ${dayLabel(end, { month: "short", day: "numeric", year: "numeric" })}` : "Dates to come";
export const roleLabel = (role: string) => role === "OWNER" ? "Organizer" : role === "COLLABORATOR" ? "Editor" : "Viewer";
