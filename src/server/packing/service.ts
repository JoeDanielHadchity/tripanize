import { prisma } from "@/server/db";
import { AppError, conflictError } from "@/server/errors";
import { canEditPackingItem, canViewPackingItem, requireTrip, roleAllows } from "@/server/auth/permissions";
import { recordChange } from "@/server/audit";
import { daysBetween } from "@/lib/dates";
import { PACKING_CATEGORIES } from "@/lib/constants";
import { getTripWeather } from "@/server/weather/trip";
import { normKey, suggestPacking } from "./suggest";
import { requirePremiumAccess } from "@/server/plans/access";

export async function getPacking(userId: string, tripId: string) {
  const access = await requireTrip(tripId, userId, "view");
  const items = await prisma.packingItem.findMany({
    // Personal lists are visible only to their owner; the shared list to all members.
    where: { tripId, dismissed: false, OR: [{ ownerId: userId }, { ownerId: null }] },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
  return { access, personal: items.filter((i) => i.ownerId === userId), shared: items.filter((i) => i.ownerId === null) };
}

/**
 * Adds new suggestions without touching existing items: personal additions, edits and packed checkmarks are
 * preserved, removed suggestions stay removed, and the unique (trip, list, normalized label) key prevents duplicates.
 */
export async function refreshSuggestions(userId: string, tripId: string, opts: { laundry: boolean | null }) {
  const access = await requireTrip(tripId, userId, "view");
  await requirePremiumAccess(tripId, "packing");
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: { destinations: { orderBy: { position: "asc" } }, stops: { where: { status: { not: "SKIPPED" }, dayId: { not: null } }, select: { title: true, category: true } }, places: true },
  });
  const profile = await prisma.profile.findUnique({ where: { userId } });
  let weather: Awaited<ReturnType<typeof getTripWeather>> | null = null;
  try {
    weather = await getTripWeather(tripId);
  } catch {
    weather = null;
  }
  const weatherDays = weather ? Object.values(weather.byDate) : [];
  const countries = new Set(trip.destinations.map((d) => d.country).filter(Boolean));
  const suggestions = suggestPacking({
    nights: trip.startDate && trip.endDate ? daysBetween(trip.startDate, trip.endDate) : 3,
    startDate: trip.startDate,
    destinations: trip.destinations.map((d) => ({ name: d.name, lat: d.lat })),
    weather: weatherDays,
    weatherAvailable: weatherDays.length > 0,
    activityText: [...trip.stops.map((s) => `${s.title} ${s.category}`), ...trip.interests, ...trip.places.map((p) => p.name), trip.notes ?? "", trip.preferences ?? ""].join(" ").toLowerCase(),
    isRoadTrip: trip.isRoadTrip,
    accommodationChanges: Math.max(0, trip.destinations.length - 1),
    laundry: opts.laundry,
    children: trip.children,
    accessibility: profile?.accessibility ?? null,
    dietary: profile?.dietary ?? trip.dietary,
    // Without a home country we assume documents/adapters may be needed rather than omit them.
    international: countries.size > 1 || !profile?.homeCity || ![...countries].some((c) => profile.homeCity?.toLowerCase().includes(String(c).toLowerCase())),
  });
  const canEditShared = roleAllows(access.role, "edit");
  return prisma.$transaction(async tx => {
    await requirePremiumAccess(tripId, "packing", tx);
    let added = 0;
    let changedShared = false;
    for (const s of suggestions) {
      if (s.shared && !canEditShared) continue;
      const listKey = s.shared ? "shared" : userId;
      const key = normKey(s.label);
      const existing = await tx.packingItem.findUnique({ where: { tripId_listKey_normKey: { tripId, listKey, normKey: key } } });
      if (existing) {
        if (existing.source === "suggested" && !existing.dismissed && existing.reason !== s.reason) {
          await tx.packingItem.update({ where: { id: existing.id }, data: { reason: s.reason } });
          changedShared ||= s.shared;
        }
        continue;
      }
      await tx.packingItem.create({ data: { tripId, ownerId: s.shared ? null : userId, listKey, label: s.label, normKey: key, category: s.category, quantity: s.quantity ?? 1, source: "suggested", reason: s.reason } });
      changedShared ||= s.shared;
      added++;
    }
    if (changedShared) await recordChange(tx, { tripId, actorId: userId, entity: "packing", entityId: tripId, action: "update" });
    return { added, weatherUsed: weatherDays.length > 0, weatherUnavailable: weather?.unavailable ?? [] };
  });
}

export async function addPackingItem(userId: string, tripId: string, input: { label: string; category: string; quantity?: number; shared: boolean }) {
  const access = await requireTrip(tripId, userId, "view");
  if (input.shared && !roleAllows(access.role, "edit")) throw new AppError("FORBIDDEN", "Viewers can't change the shared list. You can add to your personal list.");
  const label = input.label.trim().slice(0, 120);
  if (!label) throw new AppError("VALIDATION", "Enter an item name.");
  const category = (PACKING_CATEGORIES as readonly string[]).includes(input.category) ? input.category : "Misc";
  const listKey = input.shared ? "shared" : userId;
  const key = normKey(label) || label.toLowerCase();
  const existing = await prisma.packingItem.findUnique({ where: { tripId_listKey_normKey: { tripId, listKey, normKey: key } } });
  if (existing && !existing.dismissed) throw new AppError("VALIDATION", `“${existing.label}” is already on this list.`);
  return prisma.$transaction(async tx => {
    const item = existing
      ? await tx.packingItem.update({ where: { id: existing.id }, data: { dismissed: false, label, category, packed: false, source: "user", quantity: Math.max(1, Math.min(99, input.quantity ?? 1)), version: { increment: 1 } } })
      : await tx.packingItem.create({ data: { tripId, ownerId: input.shared ? null : userId, listKey, label, normKey: key, category, quantity: Math.max(1, Math.min(99, input.quantity ?? 1)), source: "user" } });
    if (input.shared) await recordChange(tx, { tripId, actorId: userId, entity: "packing", entityId: item.id, action: "create" });
    return item;
  });
}

async function loadItem(userId: string, tripId: string, itemId: string) {
  const access = await requireTrip(tripId, userId, "view");
  const item = await prisma.packingItem.findFirst({ where: { id: itemId, tripId } });
  // Someone else's personal item is reported as not found, not forbidden, so its existence isn't revealed.
  if (!item || !canViewPackingItem(item, access)) throw new AppError("NOT_FOUND", "Item not found.");
  if (!canEditPackingItem(item, access)) throw new AppError("FORBIDDEN", "Viewers can't change the shared list.");
  return item;
}

export async function updatePackingItem(userId: string, tripId: string, itemId: string, patch: { label?: string; category?: string; quantity?: number; packed?: boolean }, version: number) {
  const item = await loadItem(userId, tripId, itemId);
  const data: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim().slice(0, 120);
    if (!label) throw new AppError("VALIDATION", "Item name can't be empty.");
    data.label = label;
  }
  if (patch.category !== undefined) data.category = (PACKING_CATEGORIES as readonly string[]).includes(patch.category) ? patch.category : "Misc";
  if (patch.quantity !== undefined) data.quantity = Math.max(1, Math.min(99, Math.round(patch.quantity)));
  if (patch.packed !== undefined) data.packed = patch.packed;
  await prisma.$transaction(async tx => {
    const res = await tx.packingItem.updateMany({ where: { id: item.id, version }, data: { ...data, version: { increment: 1 } } });
    if (!res.count) throw conflictError(`“${item.label}”`);
    if (item.ownerId === null) await recordChange(tx, { tripId, actorId: userId, entity: "packing", entityId: item.id, action: "update" });
  });
}

export async function removePackingItem(userId: string, tripId: string, itemId: string) {
  const item = await loadItem(userId, tripId, itemId);
  // Removed suggestions are remembered so a refresh doesn't add them back.
  await prisma.$transaction(async tx => {
    if (item.source === "suggested") await tx.packingItem.update({ where: { id: item.id }, data: { dismissed: true, packed: false } });
    else await tx.packingItem.delete({ where: { id: item.id } });
    if (item.ownerId === null) await recordChange(tx, { tripId, actorId: userId, entity: "packing", entityId: item.id, action: "delete" });
  });
}
