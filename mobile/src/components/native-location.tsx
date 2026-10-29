import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, View } from "react-native";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { api, post } from "../lib/auth";
import { Button, ErrorNotice, Muted } from "./ui";
type Self = { scope: string; version: number; sessionId: string | null; expiresAt: string | null };

export function NativeLocation({ tripId, onChange }: { tripId: string; onChange: () => void }) {
  const [sharing, setSharing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const lease = useRef<{ token: string; remove?: () => void; stopped: boolean } | null>(null);
  const alive = useRef(true);
  const path = `/api/mobile/location?tripId=${encodeURIComponent(tripId)}`;
  async function stop() {
    const current = lease.current; lease.current = null;
    if (current) { current.stopped = true; current.remove?.(); }
    if (alive.current) setSharing(false);
    if (current) await post(path, { op: "stop", token: current.token });
  }
  useFocusEffect(useCallback(() => {
    alive.current = true;
    setSharing(false); setBusy(false);
    const subscription = AppState.addEventListener("change", state => { if (state === "background") void stop().catch(() => {}); });
    return () => { alive.current = false; subscription.remove(); void stop().catch(() => {}); };
    // The lease belongs to this mounted trip screen only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]));
  async function start() {
    setBusy(true); setError(null);
    const current = { token: [...Crypto.getRandomBytes(32)].map(b => b.toString(16).padStart(2, "0")).join(""), stopped: false, remove: undefined as (() => void) | undefined };
    lease.current = current;
    const point = (p: Location.LocationObject) => ({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? 0, capturedAt: new Date(p.timestamp).toISOString() });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Location permission is off. You can enable it in your phone settings.");
      const self = await api<Self>(path), position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (current.stopped || !alive.current || AppState.currentState !== "active") return;
      await post(path, { op: "start", token: current.token, scope: self.scope, expectedVersion: self.version, ...point(position) });
      if (current.stopped || !alive.current) { await post(path, { op: "stop", token: current.token }); return; }
      setSharing(true); onChange();
      let sending = false;
      const timer = setInterval(() => {
        if (current.stopped || sending || AppState.currentState !== "active") return;
        sending = true;
        void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(p => {
          if (current.stopped || AppState.currentState !== "active") return;
          return post(path, { op: "update", token: current.token, ...point(p) });
        }).catch(e => {
          if (alive.current) setError(e instanceof Error ? e.message : "Location sharing stopped.");
          void stop().catch(() => {});
        }).finally(() => { sending = false; });
      }, 25000);
      current.remove = () => clearInterval(timer);
      if (current.stopped) clearInterval(timer);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Could not share your location."); await stop().catch(() => {}); }
    finally { if (alive.current) setBusy(false); }
  }
  return <View style={{ gap: 12 }}>{error && <ErrorNotice message={error} />}<Muted>{sharing ? "Sharing while this screen is open." : "Your phone is not sharing from this screen."}</Muted><Button busy={busy} onPress={() => sharing ? void stop().then(onChange).catch(e => setError(e.message)) : void start()}>{sharing ? "Stop sharing my location" : "Share my location"}</Button><Button secondary onPress={() => void post(path, { op: "stop" }).then(() => { void stop().catch(() => {}); onChange(); }).catch(e => setError(e.message))}>Stop sharing on all devices</Button></View>;
}
