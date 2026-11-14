import Constants from "expo-constants";
import { Platform } from "react-native";
import { API_URL } from "./auth";

// Sends one crash report to /api/errors on the server, which groups them and emails the company
// admin about new ones. Fire-and-forget; each distinct message once per app run, 10 at most.
const sent = new Set<string>();

export function reportError(error: unknown, where?: string) {
  try {
    const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
    if (sent.size >= 10 || sent.has(e.message)) return;
    sent.add(e.message);
    void fetch(`${API_URL}/api/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "tripanize://" },
      body: JSON.stringify({ source: "app", message: e.message || e.name || "Error", stack: e.stack?.slice(0, 6000), where: `${Platform.OS} ${where ?? ""}`.trim().slice(0, 300), appVersion: Constants.expoConfig?.version }),
    }).catch(() => undefined);
  } catch { /* never let reporting crash the app */ }
}

/** Reports uncaught JavaScript errors (including fatal ones) before React Native's own handler runs. */
export function installCrashReporting() {
  const handler = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (!handler) return;
  const previous = handler.getGlobalHandler();
  handler.setGlobalHandler((error, fatal) => { reportError(error, fatal ? "crash" : "error"); previous(error, fatal); });
}
