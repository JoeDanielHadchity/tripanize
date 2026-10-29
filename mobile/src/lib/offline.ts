import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "./auth";
import type { MobileItinerary } from "./types";
const key = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, "_");
/** Only a read-only itinerary snapshot is stored. Never cache workspaces,
 * receipts, finances, chat, private research or other members' GPS points. */
export async function saveOfflineItinerary(userId: string, tripId: string) {
  const data = await api<MobileItinerary>(`/api/mobile/trips/${encodeURIComponent(tripId)}`);
  const snapshot = { savedAt: new Date().toISOString(), owner: userId, data };
  if (Platform.OS === "web") { localStorage.setItem("tripanize-offline-owner", userId); localStorage.setItem(`tripanize-native-offline:${key(userId)}:${key(tripId)}`, JSON.stringify(snapshot)); return; }
  const { Directory, File, Paths } = await import("expo-file-system");
  const folder = new Directory(Paths.document, "tripanize-offline", key(userId)); folder.create({ intermediates: true, idempotent: true });
  new File(folder, `${key(tripId)}.json`).write(JSON.stringify(snapshot));
  await SecureStore.setItemAsync("tripanize-offline-owner", userId);
}
export async function readOfflineItinerary(userId: string, tripId: string): Promise<{ savedAt: string; data: MobileItinerary } | null> {
  try {
    let text: string | null;
    if (Platform.OS === "web") text = localStorage.getItem(`tripanize-native-offline:${key(userId)}:${key(tripId)}`);
    else { const { File, Paths } = await import("expo-file-system"); const file = new File(Paths.document, "tripanize-offline", key(userId), `${key(tripId)}.json`); text = file.exists ? await file.text() : null; }
    if (!text) return null;
    const stored = JSON.parse(text);
    if (stored.owner !== userId || stored.data?.trip?.id !== tripId || !Number.isFinite(Date.parse(stored.savedAt)) || Date.now() - Date.parse(stored.savedAt) > 30 * 86400000) return null;
    return stored;
  } catch { return null; }
}
export async function clearOfflineItineraries() {
  if (Platform.OS === "web") { for (const name of Object.keys(localStorage)) if (name.startsWith("tripanize-native-offline:") || name === "tripanize-offline-owner") localStorage.removeItem(name); return; }
  await SecureStore.deleteItemAsync("tripanize-offline-owner");
  const { Directory, Paths } = await import("expo-file-system");
  const folder = new Directory(Paths.document, "tripanize-offline"); if (folder.exists) folder.delete();
  const downloads = new Directory(Paths.cache, "tripanize-downloads"); if (downloads.exists) downloads.delete();
}
export async function listOfflineItineraries(): Promise<{ savedAt: string; data: MobileItinerary }[]> {
  const owner = Platform.OS === "web" ? localStorage.getItem("tripanize-offline-owner") : await SecureStore.getItemAsync("tripanize-offline-owner");
  if (!owner) return [];
  let tripIds: string[];
  if (Platform.OS === "web") tripIds = Object.keys(localStorage).filter(k => k.startsWith(`tripanize-native-offline:${key(owner)}:`)).map(k => k.split(":").at(-1)!);
  else { const { Directory, File, Paths } = await import("expo-file-system"); const folder = new Directory(Paths.document, "tripanize-offline", key(owner)); tripIds = folder.exists ? folder.list().filter(f => f instanceof File && f.name.endsWith(".json")).map(f => f.name.slice(0, -5)) : []; }
  const results = await Promise.all(tripIds.map(id => readOfflineItinerary(owner, id)));
  return results.filter((s): s is NonNullable<typeof s> => s !== null);
}
