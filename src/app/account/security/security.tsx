"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { adminSecurityStatus } from "@/server/admin/security";
import { refreshAdminAccess } from "@/components/account-mode";
import { Badge, Button, Card, Field, Input, LinkButton, Notice } from "@/components/ui";
type Status = Awaited<ReturnType<typeof adminSecurityStatus>>;
type Result = { ok?: boolean; error?: string; expiresAt?: string; resendAt?: string };
export function AdminSecurity({ initial }: { initial: Status }) {
  const [status, setStatus] = useState(initial), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const unlocked = status.unlocked && Boolean(status.verifiedUntil && Date.parse(status.verifiedUntil) > now);
  const locked = Boolean(status.lockedUntil && Date.parse(status.lockedUntil) > now);
  const hasCode = status.codeSent && Boolean(status.expiresAt && Date.parse(status.expiresAt) > now);
  const resendSeconds = Math.max(0, Math.ceil(((status.resendAt ? Date.parse(status.resendAt) : 0) - now) / 1000));
  async function submit(body: { op: "send-code" | "unlock" | "lock"; code?: string }) {
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/account/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      const result = await response.json() as Result;
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Please try again.");
      if (body.op === "send-code") {
        setNow(Date.now());
        setStatus({ ...status, codeSent: true, expiresAt: result.expiresAt ?? null, resendAt: result.resendAt ?? null, lockedUntil: null });
      } else await refreshAdminAccess(body.op === "lock" ? "/account/security" : "/company");
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setPending(false); }
  }
  return <div className="space-y-5">
    <Card className="space-y-4">
      <Badge tone={unlocked ? "accent" : "neutral"}>{unlocked ? "Admin mode unlocked" : "Email verification"}</Badge>
      <h2 className="font-display text-xl font-semibold">{unlocked ? "Your admin tools are ready" : "Get a code by email"}</h2>
      <p className="text-sm text-muted">{unlocked ? "Admin access lasts 30 minutes. Switching to Normal mode or signing out locks it again." : <>We’ll send a 6-digit code to <strong className="break-all text-ink">{status.email}</strong>. Enter it here to open Admin mode.</>}</p>
      {error && <Notice tone="danger">{error}</Notice>}
      {locked && <Notice tone="warn">Too many incorrect attempts. Try again after {new Date(status.lockedUntil!).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" })} (Riyadh time).</Notice>}
      {unlocked ? <div className="flex flex-wrap gap-3"><LinkButton href="/company" variant="primary">Open Admin</LinkButton><Button disabled={pending} onClick={() => void submit({ op: "lock" })}>Lock Admin mode</Button></div> : <>
        {hasCode && <><Notice tone="sage">Code sent. Check your inbox and spam folder. Use the most recent code in this browser within 10 minutes.</Notice><form className="space-y-3" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const code = String(new FormData(form).get("code") ?? ""); form.reset(); void submit({ op: "unlock", code }); }}><Field label="6-digit email code" htmlFor="admin-email-code"><Input id="admin-email-code" name="code" required autoComplete="one-time-code" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" autoFocus /></Field><Button type="submit" variant="primary" disabled={pending || locked}>{pending ? "Verifying…" : "Verify & open Admin"}</Button></form></>}
        {status.codeSent && !hasCode && <Notice>Your code has expired. Request a new one below.</Notice>}
        <Button variant={hasCode ? "secondary" : "primary"} disabled={pending || locked || resendSeconds > 0} onClick={() => void submit({ op: "send-code" })}>{pending ? "Please wait…" : resendSeconds > 0 ? `Send again in ${resendSeconds}s` : hasCode ? "Send a new code" : "Send code to my email"}</Button>
        <p className="text-xs text-muted">Each code works once. No authenticator app or recovery codes needed.</p>
      </>}
    </Card>
    <p className="text-sm"><Link href="/account" className="text-accent-ink underline">Back to Account</Link></p>
  </div>;
}
