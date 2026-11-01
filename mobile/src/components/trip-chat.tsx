import { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import { authClient, post } from "../lib/auth";
import { useApi } from "../lib/data";
import { workspacePath, type MobileAction, type MobileBlock, type MobileWorkspace } from "../lib/workspace";
import { useLocationShare } from "./native-location";
import { TripMap, type MapPin } from "./trip-map";
import { Button, Card, ErrorNotice, Icon, IconButton, Muted, T, styles } from "./ui";
import { useTheme } from "./theme";

const time = (iso?: string) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""; };
const dayOf = (iso?: string) => { const d = iso ? new Date(iso) : null; if (!d || Number.isNaN(d.getTime())) return ""; const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1); return d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }); };
const ago = (iso?: string) => { const m = iso ? Math.round((Date.now() - Date.parse(iso)) / 60_000) : NaN; return !Number.isFinite(m) ? "" : m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/** People and their latest shared point, read from the member locations screen. */
function readPins(blocks: MobileBlock[] = [], myName?: string): (MapPin & { updated?: string })[] {
  return blocks.flatMap(b => {
    const url = b.actions?.find(a => a.url?.includes("query="))?.url;
    const m = url ? /query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url) : null;
    if (!m || !b.title) return [];
    return [{ id: b.id, name: b.title, lat: Number(m[1]), lng: Number(m[2]), me: b.title === myName, updated: /Updated (\S+)/.exec(b.meta ?? "")?.[1] }];
  });
}

function LocationPanel({ tripId }: { tripId: string }) {
  const c = useTheme(); const { data: session } = authClient.useSession();
  const { data, reload } = useApi<MobileWorkspace>(workspacePath({ screen: "locations", tripId }));
  const share = useLocationShare(tripId, reload);
  useEffect(() => { const t = setInterval(reload, 20_000); return () => clearInterval(t); }, [reload]);
  const others = readPins(data?.blocks, session?.user.name).filter(p => !p.me);
  const pins: MapPin[] = [...others, ...(share.me ? [{ id: "me", name: "You", me: true, ...share.me }] : [])];
  const members = data?.blocks.filter(b => b.id !== "self" && b.title) ?? [];
  return <View style={{ gap: 10 }}>
    <TripMap pins={pins} />
    <Card style={{ paddingVertical: 12, gap: 8 }}>
      <View style={styles.row}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: share.sharing ? c.accent : c.soft, alignItems: "center", justifyContent: "center" }}><Icon name={share.sharing ? "navigate" : "navigate-outline"} size={19} color={share.sharing ? c.accentText : c.accent} /></View>
        <View style={{ flex: 1 }}><T style={{ fontFamily: "InterSemibold" }}>Share my location</T><Muted>{share.busy ? "Finding you…" : share.sharing ? "Your group sees you while this screen is open" : `${others.length} of ${members.length} sharing now`}</Muted></View>
        <Switch accessibilityLabel="Share my location" value={share.sharing || share.busy} disabled={share.busy} onValueChange={share.toggle} trackColor={{ true: c.accent, false: c.line }} thumbColor="#ffffff" />
      </View>
      {share.error && <ErrorNotice message={share.error} />}
      {share.blocked && <Button compact secondary leadingIcon="settings-outline" onPress={share.openSettings}>Open phone settings</Button>}
      {others.length > 0 && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{others.map(p => <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 14, backgroundColor: c.bg }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.coral }} /><T style={{ fontSize: 12 }}>{p.name}{p.updated ? ` · ${ago(p.updated)}` : ""}</T></View>)}</View>}
      {share.sharing && <Pressable accessibilityRole="button" onPress={share.stopEverywhere}><T style={{ fontSize: 12, color: c.muted, textDecorationLine: "underline" }}>Stop sharing on all my devices</T></Pressable>}
    </Card>
  </View>;
}

/** Chat & locations: the group's map on top, the conversation below. */
export function TripChat({ data, tripId, onAction, reload, scrollToEnd }: { data: MobileWorkspace; tripId: string; onAction: (a: MobileAction) => void; reload: () => void; scrollToEnd: () => void }) {
  const c = useTheme(); const { data: session } = authClient.useSession();
  const messages = data.blocks.filter(b => b.title && !["tools", "earlier", "chat"].includes(b.id));
  const earlier = data.blocks.find(b => b.id === "earlier")?.actions?.[0];
  const markRead = data.blocks.find(b => b.id === "tools")?.actions?.find(a => a.action === "chat");
  const readKey = JSON.stringify(markRead?.values ?? null);
  // Opening the chat marks it read, quietly.
  useEffect(() => { if (markRead?.action) void post("/api/mobile/workspace", { action: markRead.action, tripId, values: markRead.values ?? {} }).catch(() => undefined); }, [readKey, tripId]); // eslint-disable-line react-hooks/exhaustive-deps
  // New messages after the first load bring the conversation into view; opening keeps the map on top.
  const seen = useRef<number | null>(null);
  useEffect(() => { if (seen.current !== null && messages.length > seen.current) scrollToEnd(); seen.current = messages.length; }, [messages.length, scrollToEnd]);
  const days = messages.map(m => dayOf(m.meta));
  return <View style={{ gap: 14 }}>
    <LocationPanel tripId={tripId} />
    <View style={[styles.row, { paddingHorizontal: 4 }]}><T accessibilityRole="header" style={{ fontFamily: "InterSemibold", fontSize: 17 }}>Group chat</T>{earlier && <Pressable accessibilityRole="button" onPress={() => onAction(earlier)}><T style={{ color: c.accent, fontFamily: "InterSemibold", fontSize: 13 }}>Earlier messages</T></Pressable>}</View>
    {!messages.length && <Card style={{ alignItems: "center", paddingVertical: 22 }}><Icon name="chatbubbles-outline" size={28} /><Muted>No messages yet. Say hello to your group!</Muted></Card>}
    <View style={{ gap: 6 }}>{messages.map((m, i) => {
      const mine = m.title === session?.user.name, deleted = m.text === "Message deleted", day = days[i], showDay = i === 0 || day !== days[i - 1];
      const remove = m.actions?.find(a => a.action === "chat");
      return <View key={m.id}>
        {showDay && <T style={{ alignSelf: "center", fontSize: 11, color: c.muted, marginVertical: 8 }}>{day}</T>}
        <Pressable disabled={!remove} onLongPress={() => { if (!remove) return; if (Platform.OS === "web") { if (window.confirm(remove.confirm ?? "Delete?")) onAction({ ...remove, confirm: undefined }); return; } Alert.alert("Delete message", remove.confirm, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => onAction({ ...remove, confirm: undefined }) }]); }} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
          {!mine && <T style={{ fontSize: 11, color: c.muted, marginLeft: 12, marginBottom: 2 }}>{m.title}</T>}
          <View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6, backgroundColor: mine ? c.accent : c.paper, ...(mine ? {} : { borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }) }}>
            <T selectable style={{ color: mine ? c.accentText : deleted ? c.muted : c.ink, fontStyle: deleted ? "italic" : "normal" }}>{m.text}</T>
            <T style={{ fontSize: 10, lineHeight: 13, marginTop: 2, alignSelf: "flex-end", color: mine ? c.accentText : c.muted, opacity: 0.75 }}>{time(m.meta)}</T>
          </View>
        </Pressable>
      </View>;
    })}</View>
  </View>;
}

/** Message box pinned above the trip tabs. */
export function ChatComposer({ data, tripId, onSent }: { data: MobileWorkspace; tripId: string; onSent: () => void }) {
  const c = useTheme(); const [text, setText] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const spec = data.blocks.find(b => b.id === "chat")?.form;
  const input = useRef<TextInput>(null);
  if (!spec) return null;
  async function send() {
    const body = text.trim(); if (!body || busy) return;
    setBusy(true); setError(null);
    try { await post("/api/mobile/workspace", { action: spec!.action, tripId, values: { ...(spec!.values ?? {}), op: "send", clientId: Crypto.randomUUID(), body } }); setText(""); onSent(); }
    catch (e) { setError(e instanceof Error ? e.message : "Message not sent."); }
    finally { setBusy(false); }
  }
  return <View style={{ backgroundColor: c.bg, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
    {error && <T style={{ color: c.danger, fontSize: 12 }}>{error}</T>}
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
      <TextInput ref={input} accessibilityLabel="Message the group" placeholder="Message the group…" placeholderTextColor={c.muted} value={text} onChangeText={setText} multiline maxLength={2000} style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, backgroundColor: c.paper, color: c.ink, fontFamily: "Inter", fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }} />
      <IconButton name="send" label="Send message" filled size={44} disabled={!text.trim() || busy} onPress={() => void send()} />
    </View>
  </View>;
}
