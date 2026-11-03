import { getMemberTripPlan } from "@/server/plans/access";
import { PremiumRequired } from "@/components/premium-required";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { requireTrip } from "@/server/auth/permissions";
import { getChatPage } from "@/server/chat/service";
import { ChatLocationsSection } from "@/components/chat-locations-section";
import { ChatView } from "./view";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Chat & locations" };
export default async function ChatPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  if (!(await getMemberTripPlan(tripId, user.id)).premium) return <PremiumRequired tripId={tripId} feature="chat" />;
  const access = await requireTrip(tripId, user.id, "view");
  const initial = await getChatPage(user.id, tripId);
  const isOwner = access.role === "OWNER";
  const invite = isOwner ? await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { name: true, travelers: { where: { leftAt: null, userId: null, isChild: false }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } } } }) : null;
  return (
    <ChatLocationsSection tripId={tripId} selected="chat">
      <p className="mb-4 text-sm text-muted">{initial.memberCount} trip member{initial.memberCount === 1 ? "" : "s"} · A shared conversation for this trip.</p>
      <ChatView key={tripId} tripId={tripId} userId={user.id} isOwner={isOwner} initial={initial} invite={invite ? { tripName: invite.name, travelers: invite.travelers } : null} />
    </ChatLocationsSection>
  );
}
