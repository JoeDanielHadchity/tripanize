import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { AppHeader } from "@/components/shell";
import { PageHeader } from "@/components/ui";
import { CreateTrip } from "@/components/create-trip";

export const metadata: Metadata = { title: "Create a trip" };

export default async function NewTripPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader user={user} current="trips" />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-32 pt-6">
        <Link href="/trips" className="text-sm text-muted hover:text-ink">← My trips</Link>
        <PageHeader title="Your next trip starts here" subtitle="Create a trip, choose Normal or Premium, then tell us where you want to go." />
        <CreateTrip />
      </main>
    </>
  );
}
