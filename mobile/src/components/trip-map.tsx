import { useMemo, useState } from "react";
import { Dimensions, Linking, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { T } from "./ui";
import { useTheme } from "./theme";

export type MapPin = { id: string; name: string; lat: number; lng: number; me?: boolean; note?: string };

const TILE = 256;
// Same OpenStreetMap tiles as the website, with an identifying user agent.
const tile = (z: number, x: number, y: number) => ({ uri: `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, headers: { "User-Agent": "Tripanize/0.3 (+https://www.tripanize.app)", Referer: "https://www.tripanize.app/" } });
const worldX = (lng: number, z: number) => (lng + 180) / 360 * TILE * 2 ** z;
const worldY = (lat: number, z: number) => { const r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * TILE * 2 ** z; };

/** Zoom that fits every pin with some margin (one pin: street level). */
function fitZoom(pins: MapPin[], width: number, height: number) {
  if (pins.length < 2) return 15;
  for (let z = 16; z > 2; z--) {
    const xs = pins.map(p => worldX(p.lng, z)), ys = pins.map(p => worldY(p.lat, z));
    if (Math.max(...xs) - Math.min(...xs) < width - 90 && Math.max(...ys) - Math.min(...ys) < height - 90) return z;
  }
  return 2;
}

/** Lightweight tile map: drag to pan, buttons to zoom. No API key needed. */
export function TripMap({ pins, height = 230, fallback }: { pins: MapPin[]; height?: number; fallback?: { lat: number; lng: number } }) {
  const c = useTheme();
  // Start from the screen width so pins are centred before the first layout pass.
  const [width, setWidth] = useState(() => Math.min(600, Dimensions.get("window").width) - 40);
  const key = pins.map(p => `${p.id}:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  const [view, setView] = useState<{ key: string; zoom: number; dx: number; dy: number } | null>(null);
  const auto = fitZoom(pins, width, height);
  const zoom = view?.key === key ? view.zoom : auto;
  const pan = view?.key === key ? { dx: view.dx, dy: view.dy } : { dx: 0, dy: 0 };
  const points = pins.length ? pins : fallback ? [{ id: "center", name: "", ...fallback }] : [];
  const centre = points.length ? {
    x: (Math.min(...points.map(p => worldX(p.lng, zoom))) + Math.max(...points.map(p => worldX(p.lng, zoom)))) / 2,
    y: (Math.min(...points.map(p => worldY(p.lat, zoom))) + Math.max(...points.map(p => worldY(p.lat, zoom)))) / 2,
  } : null;
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => setDrag({ x: g.dx, y: g.dy }),
    onPanResponderRelease: (_, g) => { setDrag({ x: 0, y: 0 }); setView(v => ({ key, zoom, dx: (v?.key === key ? v.dx : 0) - g.dx, dy: (v?.key === key ? v.dy : 0) - g.dy })); },
  }), [key, zoom]);
  const setZoom = (next: number) => {
    const z = Math.max(3, Math.min(18, next)), f = 2 ** (z - zoom);
    setView({ key, zoom: z, dx: pan.dx * f, dy: pan.dy * f });
  };
  if (!centre) return <View style={{ height, borderRadius: 20, backgroundColor: c.soft, alignItems: "center", justifyContent: "center", gap: 8 }}><Ionicons name="map-outline" size={34} color={c.accent} /><T style={{ color: c.muted, fontSize: 13 }}>No one is sharing a location yet</T></View>;
  const ox = centre.x - width / 2 + pan.dx - drag.x, oy = centre.y - height / 2 + pan.dy - drag.y;
  const n = 2 ** zoom, tiles: { x: number; y: number; left: number; top: number }[] = [];
  if (width) for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + width) / TILE); tx++) for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + height) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue;
    tiles.push({ x: ((tx % n) + n) % n, y: ty, left: tx * TILE - ox, top: ty * TILE - oy });
  }
  return <View onLayout={e => { const w = e.nativeEvent.layout.width; if (w > 0) setWidth(w); }} style={{ height, borderRadius: 20, overflow: "hidden", backgroundColor: c.dark ? "#2b3338" : "#e8e4da" }}>
    <View {...responder.panHandlers} style={StyleSheet.absoluteFill} accessibilityLabel={`Map with ${pins.length} ${pins.length === 1 ? "person" : "people"} sharing`}>
      {tiles.map(t => <Image key={`${zoom}/${t.x}/${t.y}/${t.left}`} source={tile(zoom, t.x, t.y)} cachePolicy="memory-disk" style={{ position: "absolute", left: t.left, top: t.top, width: TILE, height: TILE }} />)}
      {pins.map(p => { const x = worldX(p.lng, zoom) - ox, y = worldY(p.lat, zoom) - oy; return <View key={p.id} pointerEvents="none" style={{ position: "absolute", left: x - 60, top: y - 17, width: 120, alignItems: "center" }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: p.me ? c.accent : c.night, borderWidth: 3, borderColor: "#fff", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}><T style={{ color: "#fff", fontFamily: "NunitoBold", fontSize: 13, lineHeight: 16 }}>{p.me ? "You".slice(0, 1) : (p.name.trim()[0] ?? "?").toUpperCase()}</T></View>
        <View style={{ marginTop: 3, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.92)" }}><T numberOfLines={1} style={{ fontSize: 11, lineHeight: 15, color: "#172e33", fontFamily: "NunitoBold" }}>{p.me ? "You" : p.name}</T></View>
      </View>; })}
    </View>
    <View style={{ position: "absolute", right: 10, top: 10, gap: 6 }}>
      {[["add", () => setZoom(zoom + 1), "Zoom in"], ["remove", () => setZoom(zoom - 1), "Zoom out"], ["locate", () => setView(null), "Show everyone"]].map(([icon, onPress, label]) => <Pressable key={label as string} accessibilityRole="button" accessibilityLabel={label as string} onPress={onPress as () => void} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1, boxShadow: "0 1px 4px rgba(0,0,0,0.2)" })}><Ionicons name={icon as "add"} size={18} color="#172e33" /></Pressable>)}
    </View>
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL("https://www.openstreetmap.org/copyright")} style={{ position: "absolute", right: 6, bottom: 4, paddingHorizontal: 5, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.8)" }}><T style={{ fontSize: 9, lineHeight: 13, color: "#333" }}>© OpenStreetMap</T></Pressable>
  </View>;
}
