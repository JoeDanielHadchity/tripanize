import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { roleAllows } from "@/server/auth/permissions";
import { getPacking } from "@/server/packing/service";
import { PageHeader } from "@/components/ui";
import { PackingView } from "./view";

export const metadata: Metadata = { title: "Packing" };

export default async function PackingPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const { access, personal, shared } = await getPacking(user.id, tripId);
  const [tasks, travelers] = await Promise.all([
    prisma.tripTask.findMany({ where: { tripId }, orderBy: [{ done: "asc" }, { position: "asc" }] }),
    prisma.traveler.findMany({ where: { tripId, leftAt: null }, select: { id: true, name: true } }),
  ]);
  const map = (i: (typeof personal)[number]) => ({ id: i.id, version: i.version, label: i.label, category: i.category, quantity: i.quantity, packed: i.packed, source: i.source, reason: i.reason });
  return (
    <>
      <PageHeader title="Packing & prep" subtitle="Your personal list is private to you. The shared list is for things the group only needs once." />
      <PackingView
        tripId={tripId}
        canEditShared={roleAllows(access.role, "edit")}
        personal={personal.map(map)}
        shared={shared.map(map)}
        tasks={tasks.map((t) => ({ id: t.id, version: t.version, title: t.title, done: t.done, dueDate: t.dueDate, assigneeId: t.assigneeId }))}
        travelers={travelers}
      />
    </>
  );
}
