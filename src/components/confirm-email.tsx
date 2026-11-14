"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "@/components/ui";

/** A password account confirming its email: the 6-digit code was already emailed on sign-up or on
 * a password sign-in. Entering it confirms the email and signs the person in. */
export function ConfirmEmail({ email, next, onBack }: { email: string; next: string; onBack: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState(`We sent a 6-digit code to ${email}. It expires in 10 minutes.`);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const otp = String(new FormData(e.currentTarget).get("otp")).replace(/\s/g, "");
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
    if (error) {
      setPending(false);
      setError(error.status === 429 || error.code === "TOO_MANY_ATTEMPTS" ? "Too many wrong codes. Send a new one." : error.code === "OTP_EXPIRED" ? "That code has expired. Send a new one." : "That code isn't right. Check the email and try again.");
      return;
    }
    window.location.assign(next);
  }

  async function resend() {
    setPending(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
    setPending(false);
    if (error) setError(error.status === 429 ? "Too many requests. Please wait a minute." : "We couldn't send the email. Please try again.");
    else setInfo(`A new code is on its way to ${email}.`);
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      {!error && <Notice tone="accent">{info}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Confirmation code" htmlFor="otp">
        <Input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
      </Field>
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Confirming…" : "Confirm email and continue"}
      </Button>
      <div className="flex flex-wrap gap-4 text-sm">
        <button type="button" className="text-accent-ink underline underline-offset-2" disabled={pending} onClick={() => void resend()}>Send a new code</button>
        <button type="button" className="text-accent-ink underline underline-offset-2" onClick={onBack}>Use a different email</button>
      </div>
    </form>
  );
}
