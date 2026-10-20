"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "@/components/ui";

export function ResetForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (!token || invalid) {
    return (
      <Notice tone="danger" title="This reset link is invalid or has expired">
        <Link href="/forgot-password" className="underline">Request a new link</Link>
      </Notice>
    );
  }
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password"));
    if (password.length < 10) return setError("Use at least 10 characters.");
    setState("pending");
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
    if (error) {
      setState("idle");
      setError(error.message ?? "Couldn't reset the password. The link may have expired.");
      return;
    }
    setState("done");
  }
  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Choose a new password</h1>
      {state === "done" ? (
        <Notice tone="sage" title="Password updated" className="mt-6">
          You've been signed out everywhere. <Link href="/sign-in" className="underline">Sign in</Link> with your new password.
        </Notice>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="New password" htmlFor="password" hint="At least 10 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
          </Field>
          <Button type="submit" variant="primary" className="w-full" disabled={state === "pending"}>
            Save new password
          </Button>
        </form>
      )}
    </>
  );
}
