import { CreateTrip } from "@/components/create-trip";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { AppHeader } from "@/components/shell";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Create a trip" };

export default async function NewTripPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader user={user} current="trips" />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-32 pt-6">
        <Link href="/trips" className="text-sm text-muted hover:text-ink">← My trips</Link>
        <PageHeader title="Your next trip starts here" subtitle="Name your trip, choose Normal or Premium, then add your destination and travel details." />
        <CreateTrip />
        <p className="mt-5 text-sm text-muted">Still deciding where to go? <Link href="/destinations" className="font-semibold text-accent-ink underline underline-offset-2">Let me help you choose</Link></p>
      </main>
    </>
  );
}
