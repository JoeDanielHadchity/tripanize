import { TripStart } from "@/components/trip-start";
import { getDestinationWorkspace } from "@/server/destinations/service";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { AppHeader } from "@/components/shell";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Create a trip" };

export default async function NewTripPage() {
  const user = await requireUser();
  const destinationSearch = await getDestinationWorkspace(user.id);
  return (
    <>
      <AppHeader user={user} current="trips" />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-32 pt-6">
        <Link href="/trips" className="text-sm text-muted hover:text-ink">← My trips</Link>
        <PageHeader title="Your next trip starts here" subtitle="Know your destination? Start planning. Still deciding? Find an escape that fits you." />
        <TripStart initial={destinationSearch} create />
      </main>
    </>
  );
}
