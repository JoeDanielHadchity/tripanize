import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { requireTrip } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui";
import { MemberLocationsView } from "./view";

export const metadata: Metadata = { title: "Member locations" };
export default async function MembersPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  await requireTrip(tripId, user.id, "view");
  return <><PageHeader title="Member locations" subtitle="Find each other during your trip. Everyone controls their own sharing." /><MemberLocationsView tripId={tripId} userId={user.id} /></>;
}
