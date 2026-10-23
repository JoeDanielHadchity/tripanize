import { getMemberTripPlan } from "@/server/plans/access";
import { PremiumRequired } from "@/components/premium-required";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { roleAllows } from "@/server/auth/permissions";
import { listEvents } from "@/server/events/service";
import { aiConfigured } from "@/server/ai/openai";
import { emailConfigured } from "@/server/notifications/email";
import { EventsBookingsSection } from "@/components/events-bookings-section";
import { EventsView } from "./view";

export const metadata: Metadata = { title: "Events & bookings" };

export default async function EventsPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ event?: string }> }) {
  const { tripId } = await params;
  const { event: initialEventId } = await searchParams;
  const user = await requireUser();
  if (!(await getMemberTripPlan(tripId, user.id)).premium) return <PremiumRequired tripId={tripId} feature="events" />;
  const { access, events, runs, lastSuccess, settings } = await listEvents(user.id, tripId);
  const [days, pref, trip, deliveries] = await Promise.all([
    prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" }, select: { id: true, date: true, title: true } }),
    prisma.notificationPreference.findUnique({ where: { userId_tripId: { userId: user.id, tripId } } }),
    prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { timezone: true } }),
    prisma.notificationDelivery.findMany({ where: { userId: user.id, tripId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return (
    <EventsBookingsSection tripId={tripId} selected="events">
      <p className="mb-4 text-sm text-muted">Exhibitions, concerts, festivals and more that fit your route and dates. New finds land here — never directly in your plan.</p>
      <EventsView
        tripId={tripId}
        initialEventId={initialEventId ?? null}
        canEdit={roleAllows(access.role, "edit")}
        aiReady={aiConfigured()}
        emailReady={emailConfigured()}
        timezone={trip.timezone}
        days={days}
        settings={{ autoDiscovery: settings.autoDiscovery, everyHours: settings.discoveryEveryHours, nextAt: settings.nextDiscoveryAt?.toISOString() ?? null }}
        lastSuccess={lastSuccess?.finishedAt?.toISOString() ?? null}
        runs={runs.map((r) => ({ id: r.id, trigger: r.trigger, status: r.status, error: r.error, found: r.found, added: r.added, changed: r.changed, at: (r.finishedAt ?? r.createdAt).toISOString() }))}
        pref={{ emailEnabled: pref?.emailEnabled ?? false, frequency: pref?.frequency ?? "immediate", changeTypes: pref?.changeTypes ?? ["date", "venue", "cancelled", "sold_out"] }}
        deliveries={deliveries.map((d) => ({ id: d.id, subject: d.subject, status: d.status, at: d.createdAt.toISOString() }))}
        events={events.map((e) => ({
          id: e.id, booking: e.booking, title: e.title, category: e.category, date: e.date, endDate: e.endDate, startTime: e.startTime, dateVerified: e.dateVerified, venue: e.venue, city: e.city, address: e.address,
          officialUrl: e.officialUrl, bookingUrl: e.bookingUrl, priceText: e.priceText, availability: e.availability, bookingDeadline: e.bookingDeadline, whyFits: e.whyFits, uncertainty: e.uncertainty,
          cancelled: e.cancelled, soldOut: e.soldOut, status: e.status, origin: e.origin, lastCheckedAt: e.lastCheckedAt?.toISOString() ?? null,
          changes: (e.changes as { type: string; summary: string; at: string }[] | null) ?? [], sources: e.sources.map((s) => ({ url: s.url, title: s.title })), scheduledDate: e.stop?.day?.date ?? null,
        }))}
      />
    </EventsBookingsSection>
  );
}
