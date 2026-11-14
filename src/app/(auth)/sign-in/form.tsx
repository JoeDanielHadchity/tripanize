"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice, cx } from "@/components/ui";
import { GoogleSignIn } from "@/components/google-sign-in";
import { ConfirmEmail } from "@/components/confirm-email";

// Two equal ways in: email + password, or email + a 6-digit code. "confirm" is a password account
// that still has to confirm its email (a code was just sent).
type Method = "password" | "code";
type Step = { kind: "start" } | { kind: "code"; email: string } | { kind: "confirm"; email: string };

function sendError(err: { status?: number; message?: string }) {
  if (err.status === 429) return "Too many attempts. Please wait a minute.";
  if (err.message?.includes("EMAIL_NOT_CONFIGURED")) return "Email sign-in is unavailable. Use your password or contact support.";
  if (err.message?.includes("EMAIL_FAILED")) return "We couldn't send the email. Check the address and try again.";
  return "Couldn't send a code. Check the address and try again.";
}

export function SignInForm({ next, emailReady, google = false }: { next: string; emailReady: boolean; google?: boolean }) {
  const [method, setMethod] = useState<Method>("password");
  const [step, setStep] = useState<Step>({ kind: "start" });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendCode(address: string) {
    setPending(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" });
    setPending(false);
    if (error) return setError(sendError(error)), false;
    setStep({ kind: "code", email: address });
    setInfo(`We sent a 6-digit code to ${address}. It expires in 10 minutes.`);
    return true;
  }

  async function onStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const f = new FormData(e.currentTarget);
    const address = String(f.get("email")).trim();
    if (method === "code") { await sendCode(address); return; }
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email: address, password: String(f.get("password")) });
    if (error) {
      setPending(false);
      // Not confirmed yet: the server just emailed a confirmation code.
      if (error.code === "EMAIL_NOT_VERIFIED") { setStep({ kind: "confirm", email: address }); return; }
      setError(error.status === 429 ? "Too many attempts. Please wait a minute." : "That email and password don't match an account.");
      return;
    }
    window.location.assign(next);
  }

  async function onCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || step.kind !== "code") return;
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const name = String(f.get("name") ?? "").trim();
    const { error } = await authClient.signIn.emailOtp({ email: step.email, otp: String(f.get("otp")).replace(/\s/g, ""), ...(name ? { name } : {}) });
    if (error) {
      setPending(false);
      setError(error.status === 429 || error.code === "TOO_MANY_ATTEMPTS" ? "Too many wrong codes. Request a new one." : error.code === "OTP_EXPIRED" ? "That code has expired. Request a new one." : "That code isn't right. Check the email and try again.");
      return;
    }
    window.location.assign(next);
  }

  const restart = () => { setStep({ kind: "start" }); setError(null); setInfo(null); };
  const choose = (m: Method) => { setMethod(m); setError(null); };

  if (step.kind === "confirm") return (
    <>
      <h1 className="font-display text-3xl font-semibold">Confirm your email</h1>
      <p className="mt-1 text-muted">One last step before you sign in with your password.</p>
      <ConfirmEmail email={step.email} next={next} onBack={restart} />
    </>
  );

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Sign in</h1>
      <p className="mt-1 text-muted">{step.kind === "code" ? "Enter the code from your email." : "Use your password or get a code by email."}</p>
      {google && step.kind === "start" && <GoogleSignIn next={next} />}

      {step.kind === "start" && <>
        {emailReady && <div role="tablist" aria-label="How to sign in" className="mt-8 grid grid-cols-2 gap-1 rounded-full border border-line bg-surface-2 p-1">
          {([["password", "Password"], ["code", "Email code"]] as const).map(([m, label]) =>
            <button key={m} type="button" role="tab" aria-selected={method === m} onClick={() => choose(m)}
              className={cx("min-h-11 rounded-full px-4 text-sm font-semibold transition", method === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>{label}</button>)}
        </div>}
        <form onSubmit={onStart} className="mt-6 space-y-4">
          {!emailReady && <Notice tone="warn">Email sign-in codes aren't available on this Tripanize server yet (it has no RESEND_API_KEY or SMTP_URL). Sign in with a password.</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} />
          </Field>
          {method === "password" && <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>}
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {method === "password" ? (pending ? "Signing in…" : "Sign in") : (pending ? "Sending…" : "Email me a sign-in code")}
          </Button>
          {method === "code" && <p className="text-xs text-muted">No password needed. If you're new, this also creates your account.</p>}
        </form>
      </>}

      {step.kind === "code" && (
        <form onSubmit={onCode} className="mt-8 space-y-4">
          {info && !error && <Notice tone="accent">{info}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="Sign-in code" htmlFor="otp">
            <Input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
          </Field>
          <Field label="Your name" htmlFor="name" hint="Only needed the first time — shown to people you travel with.">
            <Input id="name" name="name" autoComplete="name" maxLength={80} />
          </Field>
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <div className="flex flex-wrap gap-4 text-sm">
            <button type="button" className="text-accent-ink underline underline-offset-2" disabled={pending} onClick={() => sendCode(step.email)}>Send a new code</button>
            <button type="button" className="text-accent-ink underline underline-offset-2" onClick={restart}>Use a different email</button>
          </div>
        </form>
      )}

      {step.kind === "start" && <div className="mt-6 flex flex-col gap-2 text-sm">
        {method === "password" && <Link href="/forgot-password" className="text-accent-ink underline underline-offset-2">Forgot your password?</Link>}
        <p className="text-muted">
          New here? <Link href={`/sign-up${next !== "/start" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent-ink underline underline-offset-2">Create an account with a password</Link>
        </p>
      </div>}
    </>
  );
}
