import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/profile";
import { AppHeader } from "@/components/shell";
import { PageHeader } from "@/components/ui";
import { TripForm } from "@/components/trip-form";

export const metadata: Metadata = { title: "Plan a new trip" };

export default async function NewTripPage() {
  const user = await requireUser();
  const { profile } = await getProfile(user.id);
  return (
    <>
      <AppHeader user={user} current="trips" />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-32 pt-6">
        <Link href="/trips" className="text-sm text-muted hover:text-ink">← My trips</Link>
        <PageHeader title="Plan a new trip" subtitle="Start with a name — add as much or as little detail as you know. You can complete everything later." />
        <TripForm mode="create" initial={{ currency: profile.defaultCurrency, pace: profile.pace, interests: profile.interests, dietary: profile.dietary ?? "", accessibility: profile.accessibility ?? "", departureCity: profile.homeCity ?? "" }} />
      </main>
    </>
  );
}
