"use client";
import { useEffect, useState } from "react";
import { Button, Notice, cx } from "@/components/ui";
import { clearOfflineData } from "./offline";
const MODE_KEY = "tripanize:account-mode-change";

export function AccountModeSwitch({ normal }: { normal: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function change(mode: "ADMIN" | "NORMAL") {
    if (pending || (mode === "NORMAL") === normal) return;
    setPending(true); setError("");
    try {
      const res = await fetch("/api/account/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't switch modes. Please try again.");
      await clearOfflineData();
      try { localStorage.setItem(MODE_KEY, crypto.randomUUID()); } catch { /* device storage may be unavailable */ }
      window.location.assign("/account");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't switch modes."); setPending(false); }
  }
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Account mode">
      <Button disabled={pending} aria-pressed={!normal} className={cx(!normal && "border-accent bg-accent-soft text-accent-ink")} onClick={() => change("ADMIN")}>Admin mode</Button>
      <Button disabled={pending} aria-pressed={normal} className={cx(normal && "border-accent bg-accent-soft text-accent-ink")} onClick={() => change("NORMAL")}>Normal mode</Button>
    </div>
    <p className="text-sm text-muted">{normal ? "You're using the regular user experience. Administrator tools and your complimentary Premium access are off for this session. Paid Premium and valid trials still work normally." : "Administrator tools and complimentary Premium access are active. Switch to Normal mode to test the regular user experience."}</p>
    <p className="text-xs text-muted">Only your verified administrator account has this switch. It applies to this sign-in and its browser tabs; other members and your other sign-ins keep their access. Changes and purchases made in either mode are real.</p>
    {pending && <p role="status" className="text-sm text-accent-ink">Switching mode…</p>}
    {error && <Notice tone="danger">{error}</Notice>}
  </div>;
}

/** Refresh other tabs and history restores so cached admin screens don't linger. */
export function AccountModeSync() {
  useEffect(() => {
    const changed = (e: StorageEvent) => { if (e.key === MODE_KEY) void clearOfflineData().finally(() => window.location.reload()); };
    const restored = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload(); };
    window.addEventListener("storage", changed); window.addEventListener("pageshow", restored);
    return () => { window.removeEventListener("storage", changed); window.removeEventListener("pageshow", restored); };
  }, []);
  return null;
}
