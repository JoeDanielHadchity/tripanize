import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getTripHeader } from "@/server/trips/service";
import { AppError } from "@/server/errors";
import { AppHeader } from "@/components/shell";
import { TripNav } from "@/components/trip-nav";
import { SyncWatcher } from "@/components/sync";
import { SaveOfflineSnapshot } from "@/components/offline";
import { Badge } from "@/components/ui";
import { formatDateRange, todayIn } from "@/lib/dates";
import { LocationSharingProvider } from "@/components/location-sharing";
import { getChatSummary } from "@/server/chat/service";
import { TripAssistant } from "@/components/trip-assistant";

export default async function TripLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  let header;
  try {
    header = await getTripHeader(user.id, tripId);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { trip, access } = header;
  const chat = await getChatSummary(user.id, tripId);
  const tripToday = todayIn(trip.timezone);
  const destinationToday = todayIn(trip.destinations.find(d => (!d.arriveDate || d.arriveDate <= tripToday) && (!d.departDate || d.departDate >= tripToday))?.timezone ?? trip.timezone);
  const defaultDate = trip.startDate && trip.endDate && destinationToday >= trip.startDate && destinationToday <= trip.endDate ? destinationToday : trip.startDate;
  return (
    <>
      <AppHeader user={user} />
      <SyncWatcher tripId={trip.id} revision={trip.revision} userId={user.id} />
      <SaveOfflineSnapshot tripId={trip.id} />
      <LocationSharingProvider key={trip.id} tripId={trip.id}>
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-4 lg:grid lg:grid-cols-[13rem_1fr] lg:gap-8 lg:pb-12">
        <aside className="lg:pt-1">
          <div className="mb-3 lg:mb-6">
            <Link href="/trips" className="text-sm text-muted hover:text-ink">← All trips</Link>
            <p className="mt-1 font-display text-lg font-semibold leading-tight">{trip.name}</p>
            <p className="text-sm text-muted">{formatDateRange(trip.startDate, trip.endDate)}</p>
            {access.role !== "OWNER" && <Badge tone={access.role === "VIEWER" ? "warn" : "sage"} className="mt-1">{access.role === "VIEWER" ? "View only" : "Collaborator"}</Badge>}
          </div>
          <TripNav tripId={trip.id} initialChat={chat} />
        </aside>
        <main id="main" className="min-w-0">{children}</main>
      </div>
      <TripAssistant key={`assistant-${trip.id}`} tripId={trip.id} defaultDate={defaultDate} />
      </LocationSharingProvider>
    </>
  );
}
