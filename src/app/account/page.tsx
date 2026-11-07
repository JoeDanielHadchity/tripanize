import type { Metadata } from "next";
import { AccountCreditsCard } from "@/components/credits";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/profile";
import { AppHeader } from "@/components/shell";
import { Badge, Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { isCompanyIdentity } from "@/server/admin/identity";
import { AccountModeSwitch } from "@/components/account-mode";
import { AccountForm } from "./form";
import { AppearanceSetting } from "@/app/settings/appearance";
import Link from "next/link";
import { prisma } from "@/server/db";
import { NewsEmailSetting } from "./news";

export const metadata: Metadata = { title: "Account & settings" };

export default async function AccountPage() {
  const user = await requireUser();
  const { profile } = await getProfile(user.id);
  const news = Boolean((await prisma.user.findUnique({ where: { id: user.id }, select: { newsEmails: true } }))?.newsEmails);
  return (
    <>
      <AppHeader user={user} current="account" />
      <main id="main" className="mx-auto max-w-2xl px-4 pb-16 pt-6">
        <PageHeader title="Account & settings" subtitle={`Signed in as ${user.email}`} />
        <AccountCreditsCard />
        <Card id="appearance" className="mb-6 scroll-mt-24">
          <h2 className="font-display text-lg font-semibold">Appearance</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Light or dark, or follow your device.</p>
          <AppearanceSetting />
        </Card>
        <Card id="news" className="mb-6 scroll-mt-24">
          <h2 className="mb-3 font-display text-lg font-semibold">Tripanize news</h2>
          <NewsEmailSetting initial={news} />
        </Card>
        <Card className="mb-6 p-0">
          <ul className="divide-y divide-line">
            <li><Link href="/notifications" className="flex min-h-14 items-center justify-between px-4 py-2 font-medium hover:text-accent-ink"><span>Notifications<span className="block text-sm font-normal text-muted">Email alerts are set in each trip's Alerts</span></span><span aria-hidden>›</span></Link></li>
            <li><Link href="/plans" className="flex min-h-14 items-center justify-between px-4 py-2 font-medium hover:text-accent-ink">Free and Premium plans <span aria-hidden>›</span></Link></li>
            <li><Link href="/contact" className="flex min-h-14 items-center justify-between px-4 py-2 font-medium hover:text-accent-ink">Contact support <span aria-hidden>›</span></Link></li>
          </ul>
        </Card>
        {user.companyAdminEligible && <><Card className="mb-6 space-y-3"><h2 className="font-display text-lg font-semibold">Account mode</h2><AccountModeSwitch normal={Boolean(user.normalMode)} unlocked={Boolean(user.companyAdmin)} /></Card><Card className="mb-6 space-y-3"><h2 className="font-display text-lg font-semibold">Admin access</h2><p className="text-sm text-muted">Unlock Admin with an email code. Access lasts 30 minutes.</p><LinkButton href="/account/security" variant="primary">{user.companyAdmin ? "Manage Admin access" : "Unlock Admin with email"}</LinkButton></Card></>}
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
