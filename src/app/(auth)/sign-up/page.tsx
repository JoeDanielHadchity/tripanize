import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { SignUpForm } from "./form";
import { currentRuntime } from "@/server/cloudflare/runtime";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/start";
  if (await getSessionUser()) redirect(safeNext);
  return <SignUpForm next={safeNext} google={Boolean(currentRuntime().google)} />;
}
