import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, Linking, Platform, View } from "react-native";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { api, post } from "../lib/auth";
import { Button, ErrorNotice, Muted } from "./ui";

type Self = { scope: string; version: number; sessionId: string | null; expiresAt: string | null };
type Lease = { token: string; remove?: () => void; stopped: boolean };
export type SharePoint = { lat: number; lng: number };

const point = (p: Location.LocationObject) => ({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.max(1, p.coords.accuracy ?? 50), capturedAt: new Date(Math.min(Date.now(), p.timestamp)).toISOString() });
const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string) => Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);

/** A fresh fix within ~20 s: a recent known position first, then a live one. */
async function freshPosition() {
  const known = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 500 }).catch(() => null);
  if (known && Date.now() - known.timestamp < 60_000) return known;
  try { return await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 15_000, "timeout"); }
  catch { return withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }), 10_000, "Could not get your location. Move near a window or turn on Wi-Fi and try again."); }
}

/** Live location sharing while this trip screen is open. The permission prompt
 * briefly backgrounds the app on Android, so it is asked before a lease exists. */
export function useLocationShare(tripId: string, onChange: () => void) {
  const [sharing, setSharing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [me, setMe] = useState<SharePoint | null>(null);
  const [blocked, setBlocked] = useState(false);
  const lease = useRef<Lease | null>(null), alive = useRef(true), asking = useRef(false);
  const path = `/api/mobile/location?tripId=${encodeURIComponent(tripId)}`;
  const stop = useCallback(async () => {
    const current = lease.current; lease.current = null;
    if (current) { current.stopped = true; current.remove?.(); }
    if (alive.current) { setSharing(false); setMe(null); }
    if (current) await post(path, { op: "stop", token: current.token });
  }, [path]);
  useFocusEffect(useCallback(() => {
    alive.current = true;
    const subscription = AppState.addEventListener("change", state => { if (state === "background" && !asking.current) void stop().catch(() => {}); });
    return () => { alive.current = false; subscription.remove(); void stop().catch(() => {}); };
  }, [stop]));
  async function start() {
    setBusy(true); setError(null); setBlocked(false);
    try {
      if (!await Location.hasServicesEnabledAsync()) throw new Error("Location is turned off on your phone. Turn on Location in your phone settings, then try again.");
      asking.current = true;
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
      asking.current = false;
      if (!permission.granted) { setBlocked(!permission.canAskAgain); throw new Error("Tripanize needs location permission to share where you are."); }
      const current: Lease = { token: [...Crypto.getRandomBytes(32)].map(b => b.toString(16).padStart(2, "0")).join(""), stopped: false };
      lease.current = current;
      const [self, position] = await Promise.all([api<Self>(path), freshPosition()]);
      if (current.stopped || !alive.current) return;
      await post(path, { op: "start", token: current.token, scope: self.scope, expectedVersion: self.version, ...point(position) });
      if (current.stopped || !alive.current) { await post(path, { op: "stop", token: current.token }); return; }
      setSharing(true); setMe({ lat: position.coords.latitude, lng: position.coords.longitude }); onChange();
      let sending = false;
      const timer = setInterval(() => {
        if (current.stopped || sending || AppState.currentState !== "active") return;
        sending = true;
        void freshPosition().then(p => {
          if (current.stopped) return;
          if (alive.current) setMe({ lat: p.coords.latitude, lng: p.coords.longitude });
          return post(path, { op: "update", token: current.token, ...point(p) });
        }).catch(e => {
          if (alive.current) setError(e instanceof Error ? e.message : "Location sharing stopped.");
          void stop().catch(() => {});
        }).finally(() => { sending = false; });
      }, 25_000);
      current.remove = () => clearInterval(timer);
      if (current.stopped) clearInterval(timer);
    } catch (e) {
      asking.current = false;
      if (alive.current) setError(e instanceof Error ? e.message : "Could not share your location.");
      await stop().catch(() => {});
    } finally { if (alive.current) setBusy(false); }
  }
  const toggle = () => { if (sharing) void stop().then(onChange).catch(e => setError(e.message)); else void start(); };
  const stopEverywhere = () => void post(path, { op: "stop" }).then(() => { void stop().catch(() => {}); onChange(); }).catch(e => setError(e.message));
  const openSettings = () => void (Platform.OS === "ios" ? Linking.openURL("app-settings:") : Linking.openSettings());
  return { sharing, busy, error, me, blocked, toggle, stopEverywhere, openSettings };
}

/** Kept for the separate member locations screen. */
export function NativeLocation({ tripId, onChange }: { tripId: string; onChange: () => void }) {
  const s = useLocationShare(tripId, onChange);
  return <View style={{ gap: 12 }}>{s.error && <ErrorNotice message={s.error} />}{s.blocked && <Button secondary compact onPress={s.openSettings}>Open phone settings</Button>}<Muted>{s.sharing ? "Sharing while this screen is open." : "Your phone is not sharing from this screen."}</Muted><Button busy={s.busy} onPress={s.toggle}>{s.sharing ? "Stop sharing my location" : "Share my location"}</Button><Button secondary onPress={s.stopEverywhere}>Stop sharing on all devices</Button></View>;
}
