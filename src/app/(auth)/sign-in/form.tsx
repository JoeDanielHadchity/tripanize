"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, Notice } from "@/components/ui";

export function SignInForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-muted">Sign in to see your trips.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
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
      <div className="mt-6 flex flex-col gap-2 text-sm">
        <Link href="/forgot-password" className="text-accent-ink underline underline-offset-2">Forgot your password?</Link>
        <p className="text-muted">
          New to Roam? <Link href={`/sign-up${next !== "/trips" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent-ink underline underline-offset-2">Create an account</Link>
        </p>
      </div>
    </>
  );
}
