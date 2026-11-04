import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { roleAllows, requireTrip } from "@/server/auth/permissions";
import { emailConfigured } from "@/server/notifications/email";
import { minorToDecimalString } from "@/lib/money";
import { LinkButton, PageHeader } from "@/components/ui";
import { TripForm } from "@/components/trip-form";
import { SharingPanel } from "./sharing";
import { TripAlerts } from "@/components/trip-alerts";
import { Fold } from "@/components/fold";
import { getTripPlan } from "@/server/plans/access";

export const metadata: Metadata = { title: "Trip settings" };

export default async function SettingsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const access = await requireTrip(tripId, user.id, "view");
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: {
      destinations: { orderBy: { position: "asc" } },
      places: true,
      travelers: { orderBy: { createdAt: "asc" } },
      memberships: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
      invitations: { where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } },
    },
  });
  const isOwner = roleAllows(access.role, "manage");
  const plan = await getTripPlan(tripId);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const pref = await prisma.notificationPreference.findUnique({ where: { userId_tripId: { userId: user.id, tripId } } });
  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerified: true } });
  const [deliveries, eventEmails] = await Promise.all([
    prisma.notificationDelivery.findMany({ where: { userId: user.id, tripId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.tripNotification.findMany({ where: { userId: user.id, tripId, kind: { in: ["event_email", "change", "booking_reminder"] }, emailStatus: { notIn: ["batched", "disabled"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const emailsOn = [pref?.changeEmailEnabled && "trip changes", pref?.bookingReminderEmailEnabled && "booking deadlines", plan.premium && pref?.emailEnabled && "events"].filter(Boolean) as string[];
  const people = trip.memberships.length;
  const sharing = {
    tripId, tripName: trip.name, meId: user.id, role: access.role, isOwner, canEdit: roleAllows(access.role, "edit"), emailReady: emailConfigured(), appUrl,
    localOnly: /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(appUrl),
    travelers: trip.travelers.map((t) => ({ id: t.id, name: t.name, isChild: t.isChild, linked: Boolean(t.userId), left: Boolean(t.leftAt) })),
    members: trip.memberships.map((m) => ({ userId: m.userId, name: m.user.name || m.user.email.split("@")[0], email: isOwner || m.userId === user.id ? m.user.email : null, role: m.role })),
    invitations: isOwner ? trip.invitations.map((i) => ({ id: i.id, role: i.role, email: i.email, expiresAt: i.expiresAt.toISOString(), emailStatus: i.emailStatus, traveler: trip.travelers.find((t) => t.id === i.travelerId)?.name ?? null })) : [],
  };
  return (
    <>
      <PageHeader title="Trip settings" />
      <div className="space-y-3">
        <Fold id="details" title="Trip details" summary="Dates, places, stays, travel and preferences">
          <TripForm
            mode="edit"
            tripId={tripId}
            canEdit={roleAllows(access.role, "edit")}
            initial={{
              version: trip.version, name: trip.name, startDate: trip.startDate, endDate: trip.endDate, timezone: trip.timezone === "UTC" ? "" : trip.timezone, currency: trip.currency,
              budget: trip.budgetMinor !== null ? minorToDecimalString(trip.budgetMinor, trip.currency) : "", pace: trip.pace, interests: trip.interests, transport: trip.transport,
              accessibility: trip.accessibility, preferences: trip.preferences, dietary: trip.dietary, restaurantPrefs: trip.restaurantPrefs, departureCity: trip.departureCity,
              arrivalLocation: trip.arrivalLocation, arrivalAt: trip.arrivalAt, departureLocation: trip.departureLocation, departureAt: trip.departureAt, adults: trip.adults, children: trip.children,
              isRoadTrip: trip.isRoadTrip, carPickupLocation: trip.carPickupLocation, carPickupAt: trip.carPickupAt, carReturnLocation: trip.carReturnLocation, carReturnAt: trip.carReturnAt, notes: trip.notes,
              destinations: trip.destinations.map((d) => ({ id: d.id, name: d.name, country: d.country, arriveDate: d.arriveDate, departDate: d.departDate, accommodationName: d.accommodationName, accommodationAddress: d.accommodationAddress, neighborhood: d.neighborhood, checkInTime: d.checkInTime, checkOutTime: d.checkOutTime, parkingNotes: d.parkingNotes })),
              mustSee: trip.places.filter((p) => p.kind === "MUST_SEE").map((p) => p.name),
              optional: trip.places.filter((p) => p.kind === "OPTIONAL").map((p) => p.name),
            }}
          />
        </Fold>
        <Fold id="people" title="Travelers & invites" summary={`${people} ${people === 1 ? "person" : "people"} on this trip${isOwner && trip.invitations.length ? ` · ${trip.invitations.length} invite${trip.invitations.length === 1 ? "" : "s"} waiting` : ""}`}>
          <SharingPanel {...sharing} part="people" />
        </Fold>
        <Fold id="alerts" title="Alerts" summary={emailsOn.length ? `Emails on for ${emailsOn.join(", ")}` : "In-app only · no emails"}>
          <TripAlerts
            tripId={tripId} email={user.email} verified={account.emailVerified} emailReady={emailConfigured()} timezone={trip.timezone}
            changes={pref?.changeEmailEnabled ?? false} bookings={pref?.bookingReminderEmailEnabled ?? false}
            events={plan.premium ? { emailEnabled: pref?.emailEnabled ?? false, frequency: pref?.frequency ?? "immediate", changeTypes: pref?.changeTypes ?? ["new", "date", "venue", "cancelled", "sold_out"] } : null}
            deliveries={[...deliveries.map(d => ({ id: d.id, subject: d.subject, status: d.status, at: d.createdAt.toISOString() })), ...eventEmails.map(n => ({ id: n.id, subject: n.emailSubject ?? "Trip update", status: n.emailStatus ?? "queued", at: n.createdAt.toISOString() }))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)}
          />
        </Fold>
        <Fold id="premium" title="Premium" summary={plan.premium ? "This trip has Premium" : "Free plan · $15 to upgrade, all travelers included"}>
          <p className="text-sm text-muted">{plan.premium ? "Everyone on this trip has the Premium features." : "Premium unlocks shared expenses, group chat, member locations, event alerts and the AI assistant for the whole group."}</p>
          <LinkButton href={`/trips/${tripId}/premium`} variant={isOwner && !plan.premium ? "primary" : "secondary"} className="mt-3">{plan.premium ? "Manage Premium" : "Upgrade to Premium · $15"}</LinkButton>
        </Fold>
        <Fold id="data" title="Export, leave or delete" tone="danger">
          <SharingPanel {...sharing} part="data" />
        </Fold>
      </div>
    </>
  );
}
