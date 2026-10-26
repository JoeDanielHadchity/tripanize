import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getTripHeader } from "@/server/trips/service";
import { AppError } from "@/server/errors";
import { AppHeader } from "@/components/shell";
import { TripNav } from "@/components/trip-nav";
import { SyncWatcher } from "@/components/sync";
import { SaveOfflineSnapshot } from "@/components/offline";
import { Badge, LinkButton } from "@/components/ui";
import { formatDateRange, todayIn } from "@/lib/dates";
import { LocationSharingProvider } from "@/components/location-sharing";
import { getChatSummary } from "@/server/chat/service";
import { TripAssistant } from "@/components/trip-assistant";
import { getTripPlan } from "@/server/plans/access";
import { userTrialAccess } from "@/server/admin/trials";
import { TrialAccessBanner } from "@/components/trial-access";
import { PremiumStar } from "@/components/premium-star";
import { JourneyCover } from "@/components/journey-cover";

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
  const plan = await getTripPlan(tripId);
  const trial = await userTrialAccess(user.id);
  const chat = plan.premium ? await getChatSummary(user.id, tripId) : { unread: 0, readSeq: 0, revision: 0 };
  const tripToday = todayIn(trip.timezone);
  const destinationToday = todayIn(trip.destinations.find(d => (!d.arriveDate || d.arriveDate <= tripToday) && (!d.departDate || d.departDate >= tripToday))?.timezone ?? trip.timezone);
  const defaultDate = trip.startDate && trip.endDate && destinationToday >= trip.startDate && destinationToday <= trip.endDate ? destinationToday : trip.startDate;
  return (
    <>
      <AppHeader user={user} />
      <SyncWatcher tripId={trip.id} revision={trip.revision} userId={user.id} premium={plan.premium} />
      <SaveOfflineSnapshot tripId={trip.id} />
      <LocationSharingProvider key={trip.id} tripId={trip.id} enabled={plan.premium}>
      <div className="trip-workspace">
        <aside className="trip-sidebar">
          <div className="trip-sidebar-title">
            <Link href="/trips" className="text-sm text-muted hover:text-ink">← All trips</Link>
            <p className="mt-1 font-display text-lg font-semibold leading-tight">{trip.name}</p>
            <p className="text-sm text-muted">{formatDateRange(trip.startDate, trip.endDate)}</p>
            <div className="mt-2"><Badge tone={plan.premium ? "accent" : "neutral"}>{plan.preview ? "Premium preview" : plan.premium ? "Premium trip" : "Normal trip"}</Badge></div>
            <Link href={`/trips/${trip.id}/premium`} className="premium-link">
              {plan.premium ? plan.source === "trial" ? "Premium trial active" : "Premium active" : trial.status === "available" ? "Activate free Premium trial" : "Premium · $15 / trip"}
            </Link>
            {access.role !== "OWNER" && <Badge tone={access.role === "VIEWER" ? "warn" : "sage"} className="mt-1">{access.role === "VIEWER" ? "View only" : "Editor"}</Badge>}
          </div>
          <TripNav tripId={trip.id} initialChat={chat} premium={plan.premium} />
        </aside>
        <main id="main" className="min-w-0"><JourneyCover name={trip.name} dates={formatDateRange(trip.startDate, trip.endDate)} destinations={trip.destinations.map(d => d.name)} />{(!plan.premium || trial.status === "active" && trial.tripId === trip.id) && <TrialAccessBanner access={trial} tripId={trip.id} canActivate={access.role === "OWNER"} />}{access.role === "OWNER" && !["PLAN", "COMPLETE"].includes(trip.onboardingStage) && <LinkButton href={`/trips/${trip.id}/onboarding`} className="mb-4" variant="secondary">Continue setup</LinkButton>}{children}</main>
      </div>
      {plan.premium && <TripAssistant key={`assistant-${trip.id}`} tripId={trip.id} defaultDate={defaultDate} />}
      {!plan.premium && <LinkButton href={`/trips/${trip.id}/premium#feature-assistant`} className="fixed bottom-20 right-4 z-20 shadow-lg lg:bottom-6"><PremiumStar /> AI assistant</LinkButton>}
      </LocationSharingProvider>
    </>
  );
}
