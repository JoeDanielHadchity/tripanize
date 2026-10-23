import { OPERATOR_NAME } from "@/lib/legal";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/profile";
import { AppHeader } from "@/components/shell";
import { Badge, Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { isCompanyIdentity } from "@/server/admin/identity";
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
        {user.companyAdmin && <Card className="mb-6 border-accent bg-accent-soft/40"><Badge tone="accent">{OPERATOR_NAME} administrator</Badge><p className="mt-3 text-sm">Premium is included for trips you organize or join. You alone can issue and revoke one-trip trial invitations.</p><LinkButton href="/company" variant="primary" className="mt-4">Manage trial invitations</LinkButton></Card>}
        {!user.companyAdmin && isCompanyIdentity(user) && <Notice className="mb-6" tone="warn" title="Verify your administrator email">Sign in with an email code to activate your all-access account and trial invitations. <LinkButton href="/sign-in?reauth=1&next=%2Fcompany" className="mt-3">Verify with an email code</LinkButton></Notice>}
        <AccountForm
          company={user.companyAdmin}
          initial={{ name: user.name, homeCity: profile.homeCity ?? "", defaultCurrency: profile.defaultCurrency, pace: profile.pace, interests: profile.interests, dietary: profile.dietary ?? "", accessibility: profile.accessibility ?? "", mapsApp: profile.mapsApp, timezone: profile.timezone ?? "" }}
        />
      </main>
    </>
  );
}
