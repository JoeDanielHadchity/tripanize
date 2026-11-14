// Sends one crash report to /api/errors (see src/server/errors/reports.ts). Fire-and-forget: a failed
// report is dropped. At most 5 reports per page load, and each distinct message once.
const sent = new Set<string>();

export function reportError(error: unknown, where?: string) {
  try {
    if (typeof window === "undefined") return;
    const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error ?? "Unknown error"));
    // Errors from browser extensions or other sites are not ours.
    if (/chrome-extension:|moz-extension:|safari-extension:/.test(e.stack ?? "")) return;
    if (sent.size >= 5 || sent.has(e.message)) return;
    sent.add(e.message);
    const body = JSON.stringify({ source: "web", message: e.message || e.name || "Error", stack: e.stack?.slice(0, 6000), where: (where ?? window.location.pathname).slice(0, 300) });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/errors", blob)) void fetch("/api/errors", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
  } catch { /* never let reporting break the page */ }
}
