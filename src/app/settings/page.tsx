import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/server/auth/session";
import { AppHeader } from "@/components/shell";
import { PublicHeader } from "@/components/public-header";
import { Card, PageHeader } from "@/components/ui";
import { SignOutButton } from "@/components/signout";
import { AppearanceSetting } from "./appearance";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  return (
    <>
      {user ? (
        <AppHeader user={user} current="settings" />
      ) : (
        <PublicHeader currentPath="/settings" />
      )}
      <main id="main" className="mx-auto max-w-2xl space-y-5 px-4 pb-16 pt-6">
        <PageHeader title="Settings" subtitle="How Tripanize looks and works for you." />
        <Card>
          <h2 className="font-display text-xl font-semibold">Appearance</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Choose light or dark mode, or follow your device.</p>
          <AppearanceSetting />
        </Card>
        {user && (
          <Card>
            <h2 className="font-display text-xl font-semibold">Account</h2>
            <p className="mt-1 text-sm text-muted">Signed in as {user.email}</p>
            <ul className="mt-3 divide-y divide-line">
              <li><Link href="/notifications" className="flex min-h-12 items-center justify-between py-2 font-medium hover:text-accent-ink">Notifications & email alerts <span aria-hidden>›</span></Link></li>
              <li><Link href="/account" className="flex min-h-12 items-center justify-between py-2 font-medium hover:text-accent-ink">Profile & travel preferences <span aria-hidden>›</span></Link></li>
              <li className="flex min-h-12 items-center justify-between py-2"><span className="font-medium">Sign out of this device</span><SignOutButton className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2" /></li>
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}
