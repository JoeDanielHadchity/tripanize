import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** The trip section each trip was last open on, so a trip reopens where you left it. */
const KEY = "tripanize-last-place";
let places: Record<string, string> = {};
const load = Platform.OS === "web" ? Promise.resolve() : SecureStore.getItemAsync(KEY).then(raw => { if (raw) places = { ...JSON.parse(raw), ...places }; }).catch(() => undefined);

export function rememberPlace(tripId: string, screen: string) {
  if (places[tripId] === screen) return;
  const { [tripId]: _old, ...rest } = places;
  // Most recent last; keep the 30 latest trips.
  places = Object.fromEntries([...Object.entries(rest), [tripId, screen]].slice(-30));
  if (Platform.OS !== "web") void load.then(() => SecureStore.setItemAsync(KEY, JSON.stringify(places))).catch(() => undefined);
}

/** Section to open for a trip: where you were, or the itinerary. */
export function lastPlace(tripId: string): string {
  return places[tripId] ?? "itinerary";
}

export function forgetPlaces() { places = {}; if (Platform.OS !== "web") void SecureStore.deleteItemAsync(KEY).catch(() => undefined); }
