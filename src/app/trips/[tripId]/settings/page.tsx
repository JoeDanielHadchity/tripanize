import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { roleAllows, requireTrip } from "@/server/auth/permissions";
import { emailConfigured } from "@/server/notifications/email";
import { minorToDecimalString } from "@/lib/money";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { TripForm } from "@/components/trip-form";
import { SharingPanel } from "./sharing";
import { TripChangeAlerts } from "@/components/notifications";
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
  return (
    <>
      <PageHeader title="Trip settings & travelers" />
      <div className="space-y-10">
        <Card className="border-accent/30 bg-accent-soft/30"><h2 className="font-display text-xl font-semibold">Premium for this trip</h2><p className="mt-2 text-sm text-muted">One payment for your group. See your people count, pricing and upgrade options.</p><LinkButton href={`/trips/${tripId}/premium`} variant={isOwner ? "primary" : "secondary"} className="mt-3">{!isOwner ? "View Premium options" : plan.capacity >= plan.people ? "Manage Premium" : "Upgrade to Premium"}</LinkButton></Card>
        <TripChangeAlerts tripId={tripId} enabled={pref?.changeEmailEnabled ?? false} emailReady={emailConfigured()} email={user.email} verified={account.emailVerified} />
        <section id="details" aria-labelledby="details-h" className="scroll-mt-20">
          <h2 id="details-h" className="mb-3 font-display text-xl font-semibold">Trip details</h2>
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
        </section>
        <SharingPanel
          tripId={tripId}
          tripName={trip.name}
          meId={user.id}
          role={access.role}
          isOwner={isOwner}
          canEdit={roleAllows(access.role, "edit")}
          emailReady={emailConfigured()}
          appUrl={appUrl}
          localOnly={/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(appUrl)}
          travelers={trip.travelers.map((t) => ({ id: t.id, name: t.name, isChild: t.isChild, linked: Boolean(t.userId), left: Boolean(t.leftAt) }))}
          members={trip.memberships.map((m) => ({ userId: m.userId, name: m.user.name || m.user.email.split("@")[0], email: isOwner || m.userId === user.id ? m.user.email : null, role: m.role }))}
          invitations={isOwner ? trip.invitations.map((i) => ({ id: i.id, role: i.role, email: i.email, expiresAt: i.expiresAt.toISOString(), emailStatus: i.emailStatus, traveler: trip.travelers.find((t) => t.id === i.travelerId)?.name ?? null })) : []}
        />
      </div>
    </>
  );
}
