import { getMemberTripPlan } from "@/server/plans/access";
import { PremiumRequired } from "@/components/premium-required";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { requireTrip } from "@/server/auth/permissions";
import { getChatPage } from "@/server/chat/service";
import { ChatLocationsSection } from "@/components/chat-locations-section";
import { ChatView } from "./view";

export const metadata: Metadata = { title: "Chat & locations" };
export default async function ChatPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  if (!(await getMemberTripPlan(tripId, user.id)).premium) return <PremiumRequired tripId={tripId} feature="chat" />;
  const access = await requireTrip(tripId, user.id, "view");
  const initial = await getChatPage(user.id, tripId);
  return (
    <ChatLocationsSection tripId={tripId} selected="chat">
      <p className="mb-4 text-sm text-muted">{initial.memberCount} trip member{initial.memberCount === 1 ? "" : "s"} · A shared conversation for this trip.</p>
      <ChatView key={tripId} tripId={tripId} userId={user.id} isOwner={access.role === "OWNER"} initial={initial} />
    </ChatLocationsSection>
  );
}
