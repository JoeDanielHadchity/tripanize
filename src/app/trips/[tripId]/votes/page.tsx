import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { listPolls } from "@/server/voting/service";
import { EventsBookingsSection } from "@/components/events-bookings-section";
import { VotesView } from "./view";
export const metadata: Metadata = { title: "Group votes" };
export default async function VotesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const u = await requireUser();
  const data = await listPolls(u.id, tripId);
  return <EventsBookingsSection tripId={tripId} selected="votes" premium={data.premium}><VotesView tripId={tripId} {...data} /></EventsBookingsSection>;
}
