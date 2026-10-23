import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { adminSecurityStatus } from "@/server/admin/security";
import { AppHeader } from "@/components/shell";
import { PageHeader } from "@/components/ui";
import { AdminSecurity } from "./security";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin security", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function AdminSecurityPage() {
  const user = await requireUser();
  if (!user.companyAdminEligible) notFound();
  const status = await adminSecurityStatus(user.id);
  return <><AppHeader user={user} current="account" /><main id="main" className="mx-auto max-w-2xl px-4 pb-16 pt-6"><PageHeader title="Admin security" subtitle="Extra protection for your administrator account." /><AdminSecurity initial={status} /></main></>;
}
