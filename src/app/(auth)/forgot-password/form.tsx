"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "@/components/ui";

export function ForgotForm({ emailReady }: { emailReady: boolean }) {
  const [state, setState] = useState<"idle" | "pending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email"));
    setState("pending");
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (error) {
      setState("error");
      setError(error.message?.includes("EMAIL") ? "We couldn't send the reset email right now. Please try again later." : (error.message ?? "Something went wrong."));
      return;
    }
    setState("sent");
  }
  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Reset your password</h1>
      {!emailReady ? (
        <Notice tone="warn" title="Password reset email isn't available on this server yet" className="mt-6">
          This installation has no email delivery configured (SMTP_URL), so reset links can't be sent. Ask the person who runs this Roam server to enable email delivery.
        </Notice>
      ) : state === "sent" ? (
        <Notice tone="sage" title="Check your inbox" className="mt-6">
          If an account exists for that address, we've emailed a link that's valid for 30 minutes.
        </Notice>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          {state === "error" && <Notice tone="danger">{error}</Notice>}
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Button type="submit" variant="primary" className="w-full" disabled={state === "pending"}>
            {state === "pending" ? "Sending…" : "Email me a reset link"}
          </Button>
        </form>
      )}
      <Link href="/sign-in" className="mt-6 inline-block text-sm text-accent-ink underline underline-offset-2">Back to sign in</Link>
    </>
  );
}
