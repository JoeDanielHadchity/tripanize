import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { requireTrip } from "@/server/auth/permissions";
import { getChatPage } from "@/server/chat/service";
import { PageHeader } from "@/components/ui";
import { ChatView } from "./view";

export const metadata: Metadata = { title: "Trip chat" };
export default async function ChatPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const access = await requireTrip(tripId, user.id, "view");
  const initial = await getChatPage(user.id, tripId);
  return <><PageHeader title="Trip chat" subtitle={`${initial.memberCount} trip member${initial.memberCount === 1 ? "" : "s"} · A shared conversation for this trip.`} /><ChatView key={tripId} tripId={tripId} userId={user.id} isOwner={access.role === "OWNER"} initial={initial} /></>;
}
