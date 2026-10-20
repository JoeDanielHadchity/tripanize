import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { createTrip } from "@/server/trips/service";
import type { TripInput } from "@/server/trips/schemas";

export async function resetDb() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export async function makeUser(name: string, email?: string) {
  return prisma.user.create({ data: { id: randomUUID(), name, email: email ?? `${name.toLowerCase()}-${randomUUID().slice(0, 6)}@example.test` } });
}

export async function makeTrip(ownerId: string, extra: Partial<TripInput> = {}) {
  return createTrip(ownerId, {
    name: "Lisbon long weekend",
    startDate: "2027-05-01",
    endDate: "2027-05-04",
    timezone: "Europe/Lisbon",
    currency: "EUR",
    destinations: [{ name: "Lisbon", country: "Portugal" }],
    travelers: [{ name: "Ben", isChild: false }],
    mustSee: ["Belém Tower"],
    ...extra,
  });
}
