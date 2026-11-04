import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { listPolls } from "@/server/voting/service";
import { ChatLocationsSection } from "@/components/chat-locations-section";
import { VotesView } from "./view";
export const metadata: Metadata = { title: "Group votes" };
export default async function VotesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const u = await requireUser();
  const data = await listPolls(u.id, tripId);
  return <ChatLocationsSection tripId={tripId} selected="votes"><VotesView tripId={tripId} {...data} /></ChatLocationsSection>;
}
