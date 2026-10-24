import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/profile";
import { AppHeader } from "@/components/shell";
import { Badge, Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { isCompanyIdentity } from "@/server/admin/identity";
import { AccountModeSwitch } from "@/components/account-mode";
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
        {user.companyAdminEligible && <><Card className="mb-6 space-y-3"><h2 className="font-display text-lg font-semibold">Account mode</h2><AccountModeSwitch normal={Boolean(user.normalMode)} unlocked={Boolean(user.companyAdmin)} /></Card><Card className="mb-6 space-y-3"><h2 className="font-display text-lg font-semibold">Admin access</h2><p className="text-sm text-muted">Administrator tools require a one-time code sent to your email. Access locks after 30 minutes, on sign-out, or when you enter Normal mode.</p><LinkButton href="/account/security" variant="primary">{user.companyAdmin ? "Manage Admin access" : "Unlock Admin with email"}</LinkButton></Card></>}
        {user.companyAdminEligible && <Card className="mb-6 border-accent bg-accent-soft/40"><Badge tone="accent">Premium always included</Badge><p className="mt-3 text-sm">Every Premium feature is included for trips you organize or join, in both Admin and Normal modes. No payment or trial expiry. Administrator tools require their own email-code verification.</p><LinkButton href={user.companyAdmin ? "/company" : "/account/security"} variant="primary" className="mt-4">{user.companyAdmin ? "Manage trial invitations" : "Unlock Admin tools"}</LinkButton></Card>}
        {!user.companyAdminEligible && isCompanyIdentity(user) && <Notice className="mb-6" tone="warn" title="Verify your administrator email">Sign in with an email code to activate your all-access account and trial invitations. <LinkButton href="/sign-in?reauth=1&next=%2Fcompany" className="mt-3">Verify with an email code</LinkButton></Notice>}
        <AccountForm
          company={user.companyAdminEligible}
          initial={{ name: user.name, homeCity: profile.homeCity ?? "", defaultCurrency: profile.defaultCurrency, pace: profile.pace, interests: profile.interests, dietary: profile.dietary ?? "", accessibility: profile.accessibility ?? "", mapsApp: profile.mapsApp, timezone: profile.timezone ?? "" }}
        />
      </main>
    </>
  );
}
