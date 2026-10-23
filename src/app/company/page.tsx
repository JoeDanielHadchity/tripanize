import { OPERATOR_NAME } from "@/lib/legal";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { companyAccount } from "@/server/admin/identity";
import { listCompanyTrials } from "@/server/admin/trials";
import { AppHeader } from "@/components/shell";
import { Badge, Card, PageHeader } from "@/components/ui";
import { TrialManager } from "./trials";
export const metadata: Metadata = { title: `${OPERATOR_NAME} administration`, robots: { index: false, follow: false } };
export default async function CompanyPage() {
  const user = await requireUser();
  if (!await companyAccount(user.id)) notFound();
  const invitations = await listCompanyTrials(user.id);
  return <><AppHeader user={user} /><main id="main" className="mx-auto max-w-4xl px-4 pb-16 pt-6">
    <PageHeader title={`${OPERATOR_NAME} administration`} subtitle="Manage complimentary trials for one trip at a time." />
    <Card className="mb-6 border-accent bg-accent-soft/40"><Badge tone="accent">All-access account</Badge><h2 className="mt-3 font-display text-xl font-semibold">Premium is included for your trips</h2><p className="mt-2 text-sm text-muted">Every Premium feature is available on trips you organize or join. Trip editing roles still apply. Only your verified {OPERATOR_NAME} administrator account can create or revoke trial invitations.</p></Card>
    <TrialManager invitations={invitations} />
  </main></>;
}
