import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { PublicHeader } from "@/components/public-header";
import { Card, PageHeader } from "@/components/ui";
import { AppearanceSetting } from "./appearance";

export const metadata: Metadata = { title: "Settings" };

/** Visitors' appearance settings. Signed-in people have everything in Account & settings. */
export default async function SettingsPage() {
  if (await getSessionUser()) redirect("/account#appearance");
  return (
    <>
      <PublicHeader currentPath="/settings" />
      <main id="main" className="mx-auto max-w-2xl space-y-5 px-4 pb-16 pt-6">
        <PageHeader title="Settings" subtitle="How Tripanize looks and works for you." />
        <Card>
          <h2 className="font-display text-xl font-semibold">Appearance</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Choose light or dark mode, or follow your device.</p>
          <AppearanceSetting />
        </Card>
        <p className="text-sm text-muted">Signed in? Your profile, notifications and appearance are together in Account &amp; settings.</p>
      </main>
    </>
  );
}
