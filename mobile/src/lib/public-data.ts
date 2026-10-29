import { useEffect, useState } from "react";
import { API_URL } from "./auth";
export type { MobilePublicHome, MobilePublicGuide } from "../../../src/lib/mobile-public";
export { publicHttpsLink, publicLoginDestination } from "../../../src/lib/mobile-public";

/** Editorial reads deliberately omit cookies and do not require an account. */
export function usePublicData<T>(guide?: string) {
  const [cycle, setCycle] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key: "" });
  const key = `${guide === undefined ? "home" : `guide:${guide}`}:${cycle}`;
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    const timer = setTimeout(() => controller.abort(), 30_000);
    fetch(`${API_URL}/api/mobile/public${guide === undefined ? "" : `?guide=${encodeURIComponent(guide)}`}`, { credentials: "omit", headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(response.status === 404 ? "Example not found." : "Could not load trip ideas."); return response.json() as Promise<T>; })
      .then(data => { if (current) setState({ key, data }); })
      .catch(error => { if (current) setState({ key, error: error.name === "AbortError" ? "The connection timed out. Try again." : error.message ?? "Could not connect." }); })
      .finally(() => clearTimeout(timer));
    return () => { current = false; controller.abort(); clearTimeout(timer); };
  }, [guide, key, cycle]);
  return { ...(state.key === key ? state : {}), retry: () => setCycle(c => c + 1) };
}
