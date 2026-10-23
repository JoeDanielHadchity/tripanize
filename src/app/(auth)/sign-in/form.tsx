"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "@/components/ui";

type Step = { kind: "email" } | { kind: "code"; email: string } | { kind: "password" };

function sendError(err: { status?: number; message?: string }) {
  if (err.status === 429) return "Too many attempts. Please wait a minute.";
  if (err.message?.includes("EMAIL_NOT_CONFIGURED")) return "This Tripanize server can't send email yet (no RESEND_API_KEY or SMTP_URL). Use a password, or ask the person who runs it to set up email.";
  if (err.message?.includes("EMAIL_FAILED")) return "We couldn't send the email. Check the address and try again.";
  return "Couldn't send a code. Check the address and try again.";
}

export function SignInForm({ next, emailReady }: { next: string; emailReady: boolean }) {
  const [step, setStep] = useState<Step>(emailReady ? { kind: "email" } : { kind: "password" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendCode(email: string) {
    setPending(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setPending(false);
    if (error) return setError(sendError(error)), false;
    setStep({ kind: "code", email });
    setInfo(`We sent a 6-digit code to ${email}. It expires in 10 minutes.`);
    return true;
  }

  async function onEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    await sendCode(String(new FormData(e.currentTarget).get("email")).trim());
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

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
    if (error) {
      setPending(false);
      setError(error.status === 429 ? "Too many attempts. Please wait a minute." : "That email and password don't match an account.");
      return;
    }
    window.location.assign(next);
  }

  const switchTo = (s: Step) => { setStep(s); setError(null); setInfo(null); };

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Sign in to Tripanize</h1>
      <p className="mt-1 text-muted">{step.kind === "password" ? "Sign in with your password." : "New or returning — we'll email you a code. No password needed."}</p>

      {step.kind === "email" && (
        <form onSubmit={onEmail} className="mt-8 space-y-4">
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </Field>
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Email me a sign-in code"}
          </Button>
        </form>
      )}

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
            <button type="button" className="text-accent-ink underline underline-offset-2" onClick={() => switchTo({ kind: "email" })}>Use a different email</button>
          </div>
        </form>
      )}

      {step.kind === "password" && (
        <form onSubmit={onPassword} className="mt-8 space-y-4">
          {!emailReady && <Notice tone="warn">Email sign-in codes aren't available on this Tripanize server yet (it has no RESEND_API_KEY or SMTP_URL). Sign in with a password.</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      )}

      <div className="mt-6 flex flex-col gap-2 text-sm">
        {step.kind === "password" ? (
          <>
            {emailReady && <button type="button" className="self-start text-accent-ink underline underline-offset-2" onClick={() => switchTo({ kind: "email" })}>Email me a code instead</button>}
            <Link href="/forgot-password" className="text-accent-ink underline underline-offset-2">Forgot your password?</Link>
          </>
        ) : (
          <button type="button" className="self-start text-accent-ink underline underline-offset-2" onClick={() => switchTo({ kind: "password" })}>Sign in with a password instead</button>
        )}
        <p className="text-muted">
          Prefer a password account? <Link href={`/sign-up${next !== "/start" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent-ink underline underline-offset-2">Create one</Link>
        </p>
      </div>
    </>
  );
}
