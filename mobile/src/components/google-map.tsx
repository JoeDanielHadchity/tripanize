import { useRef } from "react";
import { Platform, Pressable, View } from "react-native";
import Constants from "expo-constants";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { T } from "./ui";
import { useTheme } from "./theme";
import type { MapPin } from "./trip-map";

/** True when this build has a Google Maps key for this platform (set at build time in app.config.ts). */
export function googleMapsAvailable() {
  const g = Constants.expoConfig?.extra?.googleMaps as { android?: boolean; ios?: boolean } | undefined;
  return Platform.OS === "android" ? Boolean(g?.android) : Platform.OS === "ios" ? Boolean(g?.ios) : false;
}

const delta = 0.012;

/** Native Google map with the same round pins as the website. */
export function GoogleTripMap({ pins, height, fallback }: { pins: MapPin[]; height: number; fallback?: { lat: number; lng: number } }) {
  const c = useTheme();
  const map = useRef<MapView>(null);
  const first = pins[0] ?? (fallback ? { ...fallback } : null);
  const fit = (animated: boolean) => {
    if (!map.current || !pins.length) return;
    if (pins.length === 1) map.current.animateToRegion({ latitude: pins[0].lat, longitude: pins[0].lng, latitudeDelta: delta, longitudeDelta: delta }, animated ? 300 : 0);
    else map.current.fitToCoordinates(pins.map(p => ({ latitude: p.lat, longitude: p.lng })), { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated });
  };
  if (!first) return <View style={{ height, borderRadius: 20, backgroundColor: c.soft, alignItems: "center", justifyContent: "center", gap: 8 }}><Ionicons name="map-outline" size={34} color={c.accent} /><T style={{ color: c.muted, fontSize: 13 }}>No one is sharing a location yet</T></View>;
  return <View style={{ height, borderRadius: 20, overflow: "hidden" }}>
    <MapView
      ref={map}
      provider={PROVIDER_GOOGLE}
      style={{ flex: 1 }}
      initialRegion={{ latitude: first.lat, longitude: first.lng, latitudeDelta: delta, longitudeDelta: delta }}
      onMapReady={() => fit(false)}
      userInterfaceStyle={c.dark ? "dark" : "light"}
      toolbarEnabled={false}
      showsPointsOfInterests
      accessibilityLabel={`Map with ${pins.length} ${pins.length === 1 ? "person" : "people"} sharing`}
    >
      {pins.map(p => <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.me ? "You" : p.name} anchor={{ x: 0.5, y: 0.3 }}>
        <View style={{ width: 120, alignItems: "center" }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: p.me ? c.accent : c.coral, borderWidth: 3, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}><T style={{ color: "#fff", fontFamily: "NunitoBold", fontSize: 13, lineHeight: 16 }}>{p.me ? "Y" : (p.name.trim()[0] ?? "?").toUpperCase()}</T></View>
          <View style={{ marginTop: 3, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.92)" }}><T numberOfLines={1} style={{ fontSize: 11, lineHeight: 15, color: "#172e33", fontFamily: "NunitoBold" }}>{p.me ? "You" : p.name}</T></View>
        </View>
      </Marker>)}
    </MapView>
    <Pressable accessibilityRole="button" accessibilityLabel="Show everyone" onPress={() => fit(true)} style={({ pressed }) => ({ position: "absolute", right: 10, top: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1, boxShadow: "0 1px 4px rgba(0,0,0,0.2)" })}><Ionicons name="locate" size={18} color="#172e33" /></Pressable>
  </View>;
}
