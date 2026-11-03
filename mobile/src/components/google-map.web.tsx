import type { MapPin } from "./trip-map";

// react-native-maps has no web version; the web preview keeps the OpenStreetMap tile map.
export function googleMapsAvailable() {
  return false;
}

export function GoogleTripMap(_: { pins: MapPin[]; height: number; fallback?: { lat: number; lng: number } }) {
  return null;
}
