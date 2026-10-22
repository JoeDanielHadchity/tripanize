import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { listChangeNotifications } from "@/server/notifications/changes";
import { AppHeader } from "@/components/shell";
import { NotificationsInbox } from "@/components/notifications";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const inbox = await listChangeNotifications(user.id);
  const memberships = await prisma.tripMembership.findMany({ where: { userId: user.id }, include: { trip: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } });
  const prefs = await prisma.notificationPreference.findMany({ where: { userId: user.id } });
  return <>
    <AppHeader user={user} />
    <main id="main" className="mx-auto max-w-2xl space-y-5 px-4 pb-16 pt-6">
      <PageHeader title="Notifications" subtitle="Shared changes across your trips, from now on." />
      <NotificationsInbox initial={inbox} />
      <Card>
        <h2 className="font-display text-xl font-semibold">Email alerts by trip</h2>
        <p className="mt-1 text-sm text-muted">In-app notifications are always available. Enable emails in each trip’s settings.</p>
        <ul className="mt-3 divide-y divide-line">{memberships.map(m => <li key={m.id}><Link href={`/trips/${m.trip.id}/settings#notifications`} className="flex min-h-12 items-center justify-between gap-4 py-3 hover:text-accent-ink"><span className="font-medium">{m.trip.name}</span><span className="shrink-0 text-sm text-muted">{prefs.find(p => p.tripId === m.tripId)?.changeEmailEnabled ? "Email on" : "Email off"} <span aria-hidden>›</span></span></Link></li>)}</ul>
      </Card>
    </main>
  </>;
}
