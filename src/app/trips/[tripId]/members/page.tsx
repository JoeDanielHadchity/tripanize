import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { requireTrip } from "@/server/auth/permissions";
import { ChatLocationsSection } from "@/components/chat-locations-section";
import { MemberLocationsView } from "./view";

export const metadata: Metadata = { title: "Member locations · Chat & locations" };
export default async function MembersPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  await requireTrip(tripId, user.id, "view");
  return (
    <ChatLocationsSection tripId={tripId} selected="members">
      <p className="mb-4 text-sm text-muted">Everyone controls their own location sharing.</p>
      <MemberLocationsView tripId={tripId} userId={user.id} />
    </ChatLocationsSection>
  );
}
