import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/shell";
import { DestinationSearches } from "@/components/trip-start";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { getDestinationWorkspace } from "@/server/destinations/service";
import { userTrialAccess } from "@/server/admin/trials";
import { TrialAccessBanner } from "@/components/trial-access";

export const metadata: Metadata = { title: "Let me help you choose" };

export default async function DestinationsPage() {
  const user = await requireUser();
  const workspace = await getDestinationWorkspace(user.id);
  const trial = await userTrialAccess(user.id);
  return <>
    <AppHeader user={user} />
    <main id="main" className="mx-auto max-w-5xl px-4 pb-20 pt-6">
      <Link href="/start" className="text-sm text-muted hover:text-ink">← Choose how to start</Link>
      <PageHeader title="Let me help you choose" subtitle="Find a place that fits your kind of trip. When you choose a destination, we’ll save it in My trips." />
      <TrialAccessBanner access={trial} />
      <DestinationSearches initial={workspace} />
    </main>
  </>;
}
