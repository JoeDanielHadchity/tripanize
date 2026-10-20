import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { emailConfigured } from "@/server/notifications/email";
import { SignInForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/trips";
  if (await getSessionUser()) redirect(safeNext);
  return <SignInForm next={safeNext} emailReady={emailConfigured()} />;
}
