"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import type { adminSecurityStatus } from "@/server/admin/security";
import { refreshAdminAccess } from "@/components/account-mode";
import { Badge, Button, Card, Field, Input, LinkButton, Notice } from "@/components/ui";
type Status = Awaited<ReturnType<typeof adminSecurityStatus>>;
type Result = { ok?: boolean; error?: string; uri?: string; setupKey?: string; recoveryCodes?: string[]; verifiedUntil?: string };
const reauthenticate = "/sign-in?reauth=1&next=%2Faccount%2Fsecurity";
export function AdminSecurity({ initial }: { initial: Status }) {
  const [status, setStatus] = useState(initial), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [setup, setSetup] = useState<{ uri: string; key: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]), [saved, setSaved] = useState(false), [recovery, setRecovery] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  const unlocked = status.unlocked && Boolean(status.verifiedUntil && Date.parse(status.verifiedUntil) > now);
  async function submit(body: object) {
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/account/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      const result = await response.json() as Result;
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Verification could not be completed.");
      if (result.uri && result.setupKey) setSetup({ uri: result.uri, key: result.setupKey });
      else if (result.recoveryCodes) {
        setSetup(null); setRecoveryCodes(result.recoveryCodes); setSaved(false);
        setStatus({ ...status, enrolled: true, unlocked: true, verifiedUntil: result.verifiedUntil ?? null, recoveryRemaining: result.recoveryCodes.length });
      } else await refreshAdminAccess("op" in body && body.op === "lock" ? "/account/security" : "/company");
    } catch (e) { setError(e instanceof Error ? e.message : "Verification could not be completed."); }
    finally { setPending(false); }
  }
  function codeForm(op: "confirm" | "unlock" | "recovery-codes") {
    return <form className="space-y-3" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const value = String(new FormData(form).get("code") ?? ""); form.reset(); void submit({ op, code: value, ...(op === "unlock" ? { recovery } : {}) }); }}>
      <Field label={op === "unlock" && recovery ? "One recovery code" : "6-digit authenticator code"} htmlFor={`code-${op}`} hint={op === "unlock" && recovery ? "Each recovery code can be used once." : "Use the current code in your authenticator app. A code can only be used once."}>
        <Input key={`${op}-${recovery}`} id={`code-${op}`} name="code" required autoComplete="one-time-code" inputMode={op === "unlock" && recovery ? "text" : "numeric"} maxLength={op === "unlock" && recovery ? 40 : 6} pattern={op === "unlock" && recovery ? undefined : "[0-9]{6}"} autoFocus />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>{pending ? "Verifying…" : op === "confirm" ? "Confirm authenticator" : op === "recovery-codes" ? "Generate new recovery codes" : "Unlock admin access"}</Button>
    </form>;
  }
  return <div className="space-y-5">
    {error && <Notice tone="danger">{error}</Notice>}
    {recoveryCodes.length > 0 ? <Card className="space-y-4"><Badge tone="accent">Authenticator confirmed</Badge><h2 className="font-display text-xl font-semibold">Save your recovery codes</h2><p className="text-sm text-muted">Store these in your password manager or another safe place. Each code unlocks admin access once if you lose your phone. These codes are shown only now. Any previous recovery codes have been replaced.</p><ul className="grid grid-cols-1 gap-2 rounded-xl border border-line bg-surface-2 p-4 sm:grid-cols-2">{recoveryCodes.map(value => <li key={value}><code className="select-all text-xs">{value}</code></li>)}</ul><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} className="mt-1 h-4 w-4" />I saved these recovery codes somewhere safe.</label><Button variant="primary" disabled={!saved || pending} onClick={() => { setRecoveryCodes([]); void refreshAdminAccess("/company"); }}>Continue to Admin</Button></Card>
    : setup ? <Card className="space-y-5"><h2 className="font-display text-xl font-semibold">Connect your authenticator app</h2><p className="text-sm text-muted">In Google Authenticator, Microsoft Authenticator, 1Password, or another authenticator app, add an account and scan this QR code. Setup expires in 10 minutes.</p><div className="mx-auto w-fit max-w-full rounded-xl bg-white p-5"><QRCode value={setup.uri} size={208} style={{ maxWidth: "100%", height: "auto" }} title="Scan with your authenticator app" /></div><details className="text-sm"><summary className="cursor-pointer font-medium">Enter the setup key manually instead</summary><p className="mt-3 text-muted">Account: Tripanize.app · Time-based · 6 digits · 30 seconds</p><code className="mt-2 block break-all rounded-xl bg-surface-2 p-3 text-xs select-all">{setup.key}</code></details><Notice>Confirming setup signs out your other sessions. If you are replacing an authenticator, your current one keeps working until you confirm this new one.</Notice>{codeForm("confirm")}<Button variant="ghost" disabled={pending} onClick={() => { setSetup(null); setError(""); }}>Cancel setup</Button></Card>
    : !status.enrolled ? <Card className="space-y-4"><Badge tone="warn">Setup required</Badge><h2 className="font-display text-xl font-semibold">Protect your admin tools</h2><p className="text-sm text-muted">Your administrator tools stay locked until an authenticator app is connected and you confirm its first code. Regular trip features remain available.</p>{status.freshEmail ? <Button variant="primary" disabled={pending} onClick={() => void submit({ op: "enroll" })}>{pending ? "Preparing setup…" : "Set up authenticator"}</Button> : <><Notice>First, confirm you own this account by signing in with a fresh email code. Then you will return here to connect your phone.</Notice><LinkButton href={reauthenticate} variant="primary">Verify my email to start setup</LinkButton></>}</Card>
    : <><Card className="space-y-4"><Badge tone={unlocked ? "accent" : "warn"}>{unlocked ? "Admin access unlocked" : "Admin access locked"}</Badge><p className="text-sm text-muted">Your authenticator is connected. Admin access lasts 30 minutes and locks when you sign out or switch to Normal mode. Signing in with an email code or password alone does not unlock admin tools.</p>{status.lockedUntil && Date.parse(status.lockedUntil) > now && <Notice tone="warn">Verification is temporarily locked after incorrect attempts. Please wait 15 minutes before trying again.</Notice>}{unlocked ? <div className="flex flex-wrap gap-3"><LinkButton href="/company" variant="primary">Open Admin</LinkButton><Button disabled={pending} onClick={() => void submit({ op: "lock" })}>Lock admin access now</Button></div> : <>{codeForm("unlock")}<button className="text-sm font-medium text-accent-ink underline" type="button" disabled={pending} onClick={() => { setRecovery(!recovery); setError(""); }}>{recovery ? "Use my authenticator app" : "Use a recovery code instead"}</button></>}</Card>
    <Card className="space-y-4"><h2 className="font-display text-xl font-semibold">Recovery & replacement</h2><p className="text-sm text-muted">{status.recoveryRemaining} unused recovery codes remain. Keep them somewhere safe. Email sign-in and password reset cannot turn off authenticator protection.</p><details><summary className="cursor-pointer text-sm font-semibold">Replace my recovery codes</summary><div className="mt-4 space-y-3"><p className="text-sm text-muted">Enter a fresh authenticator code. This immediately replaces all previous recovery codes.</p>{codeForm("recovery-codes")}</div></details><details><summary className="cursor-pointer text-sm font-semibold">Move to a different authenticator</summary><div className="mt-4 space-y-3"><p className="text-sm text-muted">First sign in with a fresh email code, then unlock admin access with your current authenticator or a recovery code. Start replacement within five minutes of unlocking.</p><LinkButton href={reauthenticate}>Verify email again</LinkButton>{status.freshEmail && unlocked && <Button disabled={pending} onClick={() => void submit({ op: "enroll" })}>Set up replacement authenticator</Button>}</div></details><p className="text-xs text-muted">If you lose both your authenticator and all recovery codes, recovery requires a manual account ownership check. There is no email-only bypass.</p></Card></>}
    <p className="text-sm"><Link href="/account" className="text-accent-ink underline">Back to Account</Link></p>
  </div>;
}
