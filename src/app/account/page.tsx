import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/profile";
import { AppHeader } from "@/components/shell";
import { LinkButton, PageHeader } from "@/components/ui";
import { AccountForm } from "./form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  const { profile } = await getProfile(user.id);
  return (
    <>
      <AppHeader user={user} current="account" />
      <main id="main" className="mx-auto max-w-2xl px-4 pb-16 pt-6">
        <PageHeader title="Account & preferences" subtitle={`Signed in as ${user.email}`} />
        <div className="mb-5 flex flex-wrap gap-3"><LinkButton href="/plans">Normal and Premium plans</LinkButton><LinkButton href="/contact">Contact support</LinkButton></div>
        <AccountForm
          initial={{ name: user.name, homeCity: profile.homeCity ?? "", defaultCurrency: profile.defaultCurrency, pace: profile.pace, interests: profile.interests, dietary: profile.dietary ?? "", accessibility: profile.accessibility ?? "", mapsApp: profile.mapsApp, timezone: profile.timezone ?? "" }}
        />
      </main>
    </>
  );
}
