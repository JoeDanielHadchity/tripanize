import { z } from "zod";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { requirePremiumAccess } from "@/server/plans/access";
import { isValidTimeZone } from "@/lib/dates";
import { formatZodError } from "@/server/trips/schemas";
import { accountDisplayName } from "@/server/admin/identity";

export const profileInput = z.object({
  name: z.string().trim().min(1, "Enter a display name").max(80),
  homeCity: z.string().trim().max(120).optional().nullable(),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  pace: z.enum(["RELAXED", "BALANCED", "AMBITIOUS"]),
  interests: z.array(z.string().max(60)).max(30),
  dietary: z.string().trim().max(500).optional().nullable(),
  accessibility: z.string().trim().max(1000).optional().nullable(),
  mapsApp: z.enum(["GOOGLE", "APPLE", "OSM"]),
  timezone: z.string().optional().nullable(),
});

export async function getProfile(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  return { user, profile: user.profile ?? { userId, homeCity: null, defaultCurrency: "EUR", pace: "BALANCED" as const, interests: [], dietary: null, accessibility: null, mapsApp: "GOOGLE" as const, timezone: null } };
}

export async function updateProfile(userId: string, input: z.input<typeof profileInput>) {
  const r = profileInput.safeParse(input);
  if (!r.success) throw new AppError("VALIDATION", formatZodError(r.error));
  const { name, ...p } = r.data;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const data = { ...p, homeCity: p.homeCity || null, dietary: p.dietary || null, accessibility: p.accessibility || null, timezone: p.timezone && isValidTimeZone(p.timezone) ? p.timezone : null };
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { name: accountDisplayName({ ...user, name }) } }),
    prisma.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data }),
  ]);
}

export async function updateNotificationPrefs(userId: string, tripId: string, input: { emailEnabled: boolean; frequency: string; changeTypes: string[] }) {
  await requireTrip(tripId, userId, "view");
  if (input.emailEnabled) await requirePremiumAccess(tripId, "events");
  const frequency = input.frequency === "daily" ? "daily" : "immediate";
  const allowed = ["new", "date", "venue", "cancelled", "sold_out", "booking_open", "price"];
  const changeTypes = input.changeTypes.filter((c) => allowed.includes(c));
  if (input.emailEnabled && !(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified) throw new AppError("VALIDATION", "Verify your email before enabling event emails.");
  await prisma.$transaction(async tx => {
  await tx.notificationPreference.upsert({
    where: { userId_tripId: { userId, tripId } },
    create: { userId, tripId, emailEnabled: input.emailEnabled, frequency, changeTypes },
    update: { emailEnabled: input.emailEnabled, frequency, changeTypes },
  });
  await tx.tripNotification.updateMany({ where: { userId, tripId, kind: "event_email", emailStatus: { in: ["queued", "digest"] } }, data: { emailStatus: "cancelled", nextAttemptAt: null } });
  });
}
