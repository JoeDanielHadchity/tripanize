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
import { PremiumStar } from "@/components/premium-star";
import { premiumPrice, selectedPremiumFeatures, tripCheckoutQuote } from "@/lib/plans";

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
  const quote = tripCheckoutQuote(selectedPremiumFeatures(trip.selectedPremiumFeatures), plan.people, plan.creditMinor);
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
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-4 lg:grid lg:grid-cols-[13rem_1fr] lg:gap-8 lg:pb-12">
        <aside className="lg:pt-1">
          <div className="mb-3 lg:mb-6">
            <Link href="/trips" className="text-sm text-muted hover:text-ink">← All trips</Link>
            <p className="mt-1 font-display text-lg font-semibold leading-tight">{trip.name}</p>
            <p className="text-sm text-muted">{formatDateRange(trip.startDate, trip.endDate)}</p>
            <div className="mt-2"><Badge tone={plan.premium ? "accent" : "neutral"}>{plan.preview ? "Premium preview" : plan.premium ? "Premium trip" : "Normal trip"}</Badge></div>
            <LinkButton href={`/trips/${trip.id}/premium`} variant={access.role === "OWNER" ? "primary" : "secondary"} className="mt-3 w-full sm:w-auto lg:w-full">
              {access.role !== "OWNER" ? "Features & checkout" : plan.premium ? "Premium · $0 due" : `Checkout${quote.dueMinor === null ? "" : ` · ${premiumPrice(quote.dueMinor)}`}`}
            </LinkButton>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><PremiumStar /> Premium feature · choose at checkout</p>
            {access.role !== "OWNER" && <Badge tone={access.role === "VIEWER" ? "warn" : "sage"} className="mt-1">{access.role === "VIEWER" ? "View only" : "Collaborator"}</Badge>}
          </div>
          <TripNav tripId={trip.id} initialChat={chat} premium={plan.premium} />
        </aside>
        <main id="main" className="min-w-0">{children}</main>
      </div>
      {plan.premium && <TripAssistant key={`assistant-${trip.id}`} tripId={trip.id} defaultDate={defaultDate} />}
      {!plan.premium && <LinkButton href={`/trips/${trip.id}/premium#feature-assistant`} className="fixed bottom-20 right-4 z-20 shadow-lg lg:bottom-6"><PremiumStar /> AI assistant</LinkButton>}
      </LocationSharingProvider>
    </>
  );
}
