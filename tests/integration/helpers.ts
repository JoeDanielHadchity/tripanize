import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { createTrip } from "@/server/trips/service";
import type { TripInput } from "@/server/trips/schemas";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";

/** Pre-authenticated owner fixture for admin feature tests. The dedicated
 * admin-security tests exercise email delivery, code verification and expiry.
 */
export async function adminAuthenticationFixture(userId: string) {
  const session = await prisma.session.create({ data: { id: randomUUID(), token: randomUUID(), userId, expiresAt: new Date(Date.now() + 86400_000), adminEmailUnlockedAt: new Date(), adminVerifiedUntil: new Date(Date.now() + 30 * 60_000) } });
  setTestRuntime({ ...currentRuntime(), accountMode: { userId, sessionId: session.id, normal: false } });
  return session;
}

export async function resetDb() {
  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys=OFF");
  try { for (const { name } of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${name.replaceAll('"', '""')}"`); }
  finally { await prisma.$executeRawUnsafe("PRAGMA foreign_keys=ON"); }
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
