"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "@/components/ui";

export function SignUpForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 10) return setError("Use at least 10 characters for your password.");
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({ name: String(f.get("name")).trim(), email: String(f.get("email")).trim(), password });
    if (error) {
      setPending(false);
      setError(error.code === "USER_ALREADY_EXISTS" || error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ? "An account with this email already exists. Try signing in." : error.message ?? "Couldn't create the account.");
      return;
    }
    window.location.assign(next);
  }
  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Create your account</h1>
      <p className="mt-1 text-muted">Each traveler has their own account, so shared trips stay private.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Your name" htmlFor="name" hint="Shown to people you travel with.">
          <Input id="name" name="name" autoComplete="name" required maxLength={80} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        </Field>
        <p className="text-xs leading-5 text-muted">By creating an account, you agree to our <Link href="/terms" className="text-accent-ink underline">Terms of service</Link>. Read our <Link href="/privacy" className="text-accent-ink underline">Privacy policy</Link> to understand how your information is used.</p>
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Already have an account? <Link href={`/sign-in${next !== "/trips" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent-ink underline underline-offset-2">Sign in</Link>
      </p>
    </>
  );
}
