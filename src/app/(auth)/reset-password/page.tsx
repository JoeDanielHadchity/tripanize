import type { Metadata } from "next";
import { ResetForm } from "./form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return <ResetForm token={token ?? null} invalid={Boolean(error)} />;
}
