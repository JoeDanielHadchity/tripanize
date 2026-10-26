import { CreateTrip } from "@/components/create-trip";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { AppHeader } from "@/components/shell";
import { PageHeader } from "@/components/ui";
import { userTrialAccess } from "@/server/admin/trials";
import { TrialAccessBanner } from "@/components/trial-access";

export const metadata: Metadata = { title: "Create a trip" };

export default async function NewTripPage() {
  const user = await requireUser();
  const trial = await userTrialAccess(user.id);
  return (
    <>
      <AppHeader user={user} current="trips" />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-32 pt-6">
        <Link href="/trips" className="text-sm text-muted hover:text-ink">← My trips</Link>
        <PageHeader title="Create a trip" />
        {trial.status !== "available" && <TrialAccessBanner access={trial} />}
        <CreateTrip trial={trial.status === "available" ? { invitationId: trial.invitationId, durationDays: trial.durationDays } : undefined} />
        <p className="mt-5 text-sm text-muted">Still deciding where to go? <Link href="/destinations" className="font-semibold text-accent-ink underline underline-offset-2">Find a destination</Link></p>
      </main>
    </>
  );
}
