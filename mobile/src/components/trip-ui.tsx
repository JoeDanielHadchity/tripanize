import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { tripDates } from "../lib/data";
import { mobileTripTabs, type MobileAction, type MobileTarget, type MobileWorkspace } from "../lib/workspace";
import { Badge, Button, Heading, Icon, IconButton, OnPhoto, PhotoCard, T, styles, type IconName } from "./ui";
import { useTheme } from "./theme";

export type RunAction = (action: MobileAction) => void;

export function Chip({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <Badge tone={accent ? "accent" : "default"}>{children}</Badge>;
}

/** Chip-like actions; the first one can be the primary call to action. */
export function ActionRow({ actions, onAction, busy, primary = false }: { actions: MobileAction[]; onAction: RunAction; busy?: boolean; primary?: boolean }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{actions.map((action, i) => <Button key={`${action.label}-${i}`} compact secondary={!primary || i > 0} tone={action.danger ? "danger" : action.device === "purchase" ? "coral" : undefined} leadingIcon={actionIcon(action)} disabled={busy} onPress={() => onAction(action)}>{action.label}</Button>)}</View>;
}

/** A small icon helps scanning; only well-known actions get one. */
function actionIcon(action: MobileAction): IconName | undefined {
  if (action.device === "file") return "download-outline";
  if (action.device === "offline") return "cloud-download-outline";
  if (action.device === "purchase") return "sparkles";
  if (action.url) return "open-outline";
  const l = action.label.toLowerCase();
  if (l === "directions") return "navigate-outline";
  if (l.startsWith("edit")) return "create-outline";
  if (l.startsWith("delete") || l.startsWith("remove")) return "trash-outline";
  return undefined;
}

export function ActionSheet({ label, actions, onAction, icon = "ellipsis-horizontal", busy = false, iconOnly = false }: { label: string; actions: MobileAction[]; onAction: RunAction; icon?: IconName; busy?: boolean; iconOnly?: boolean }) {
  const c = useTheme(); const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  return <>{iconOnly ? <IconButton name={icon} label={label} disabled={busy} onPress={() => setOpen(true)} size={40} /> : <Button compact secondary leadingIcon={icon} disabled={busy} onPress={() => setOpen(true)}>{label}</Button>}<Sheet open={open} title={label} close={() => setOpen(false)}>
    {actions.map((action, index) => <Pressable key={index} accessibilityRole="button" disabled={busy} onPress={() => { setOpen(false); onAction(action); }} style={({ pressed }) => ({ minHeight: 54, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: index === actions.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: action.danger ? c.coralSoft : c.soft, alignItems: "center", justifyContent: "center" }}><Ionicons name={actionIcon(action) ?? (action.to ? "arrow-forward" : "flash-outline")} size={17} color={action.danger ? c.danger : c.accent} /></View>
      <T style={{ flex: 1, color: action.danger ? c.danger : c.ink, fontFamily: "InterSemibold" }}>{action.label}</T>
    </Pressable>)}
  </Sheet></>;
}

/** Slide-up bottom sheet with a grabber, keyboard-aware for forms. */
export function Sheet({ open, title, close, children, footer }: { open: boolean; title: string; close: () => void; children: ReactNode; footer?: ReactNode }) {
  const c = useTheme();
  return <Modal visible={open} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
    <View style={{ flex: 1, backgroundColor: "rgba(10,20,24,0.45)" }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ flex: 1 }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <SafeAreaView edges={["bottom", "left", "right"]} accessibilityViewIsModal style={{ backgroundColor: c.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "88%", paddingHorizontal: 20, paddingTop: 10 }}>
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, marginBottom: 10 }} />
          <View style={[styles.row, { marginBottom: 6 }]}><View style={{ flex: 1 }}><Heading small>{title}</Heading></View><IconButton name="close" label="Close" size={36} onPress={close} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20, gap: 14 }} showsVerticalScrollIndicator={false}>{children}</ScrollView>
          {footer && <View style={{ paddingVertical: 12 }}>{footer}</View>}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  </Modal>;
}

/** Thin bar that slides while a section refreshes behind the content. */
function LoadingBar({ active }: { active: boolean }) {
  const c = useTheme(); const [x] = useState(() => new Animated.Value(0)), [width, setWidth] = useState(0);
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    x.setValue(0); loop.start();
    return () => loop.stop();
  }, [active, x]);
  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ height: 2, overflow: "hidden", opacity: active ? 1 : 0 }}>
    <Animated.View style={{ width: "35%", height: 2, borderRadius: 1, backgroundColor: c.accent, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.35, width] }) }] }} />
  </View>;
}

/** Compact trip bar shown above every trip section. */
export function TripHeader({ data, onBack, right, loading = false }: { data?: MobileWorkspace | null; onBack?: () => void; right?: ReactNode; loading?: boolean }) {
  const c = useTheme();
  return <View style={{ backgroundColor: c.bg }}><View style={[styles.row, { paddingHorizontal: 16, paddingVertical: 8 }]}>
    <IconButton name="chevron-back" label="All trips" onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace("/trips"))} />
    <View style={{ flex: 1, alignItems: "center" }}><T numberOfLines={1} style={{ fontFamily: "InterSemibold", fontSize: 15 }}>{data?.trip?.name ?? " "}</T><T numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: c.muted }}>{data?.trip ? tripDates(data.trip.startDate, data.trip.endDate) : " "}</T></View>
    {right ?? <View style={{ width: 44 }} />}
  </View><LoadingBar active={loading} /></View>;
}

/** Placeholder shapes while a trip section loads for the first time. */
export function TripSkeleton({ hero = false }: { hero?: boolean }) {
  const c = useTheme(); const [pulse] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true })]));
    loop.start(); return () => loop.stop();
  }, [pulse]);
  const block = (h: number, w: number | `${number}%` = "100%", r = 18) => <View style={{ height: h, width: w, borderRadius: r, backgroundColor: c.soft }} />;
  return <Animated.View accessibilityLabel="Loading" style={{ gap: 14, opacity: pulse }}>
    {hero ? block(200, "100%", 24) : <View style={{ gap: 8, paddingHorizontal: 4 }}>{block(26, "55%", 8)}{block(14, "35%", 6)}</View>}
    {hero && <View style={{ flexDirection: "row", gap: 8 }}>{[0, 1, 2, 3].map(i => <View key={i}>{block(78, 68, 18)}</View>)}</View>}
    {block(120)}{block(120)}{block(90)}
  </Animated.View>;
}

/** Photo hero for the itinerary; other sections keep the compact header. */
export function TripHero({ data, cover }: { data: MobileWorkspace; cover?: { url: string; credit?: string } }) {
  if (!data.trip) return null;
  return <PhotoCard source={cover?.url} height={200} label={`${data.trip.name}, ${data.trip.destinations.join(", ")}`} top={<><Badge onImage icon={data.role === "OWNER" ? "star-outline" : data.role === "COLLABORATOR" ? "create-outline" : "eye-outline"}>{data.role === "OWNER" ? "Organizer" : data.role === "COLLABORATOR" ? "Editor" : "Viewer"}</Badge>{data.premium ? <Badge onImage icon="sparkles">Premium</Badge> : <View />}</>}>
    <OnPhoto size="small">{data.trip.destinations.join("  →  ")}</OnPhoto>
    <OnPhoto size="title">{data.trip.name}</OnPhoto>
    <OnPhoto>{tripDates(data.trip.startDate, data.trip.endDate)}</OnPhoto>
    {cover?.credit && <OnPhoto size="small" style={{ fontSize: 9, lineHeight: 12, opacity: 0.7 }}>{cover.credit}</OnPhoto>}
  </PhotoCard>;
}

/** Kept for screens without a cover image. */
export function TripSummary({ data }: { data: MobileWorkspace }) {
  const c = useTheme();
  if (!data.trip) return null;
  return <View style={{ gap: 6 }}><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{data.trip.destinations.map((d, i) => <View key={`${d}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>{i > 0 && <Icon name="arrow-forward" size={12} color={c.muted} />}<T style={{ fontSize: 13, color: c.muted }}>{d}</T></View>)}</View></View>;
}

const TABS: { id: string; label: string; icon: IconName; active: IconName }[] = [
  { id: "itinerary", label: "Plan", icon: "map-outline", active: "map" },
  { id: "expenses", label: "Money", icon: "wallet-outline", active: "wallet" },
  { id: "chat", label: "Chat", icon: "chatbubbles-outline", active: "chatbubbles" },
  { id: "bookings", label: "Bookings", icon: "ticket-outline", active: "ticket" },
];
function activeTab(screen: string) {
  if (["itinerary", "day", "stop", "plan", "job", "versions", "assistant"].includes(screen)) return "itinerary";
  if (["expenses", "expense", "settlement"].includes(screen)) return "expenses";
  if (["chat", "locations"].includes(screen)) return "chat";
  if (["bookings", "booking", "events", "event"].includes(screen)) return "bookings";
  return "more";
}

export function TripNavigation({ tripId, screen, premium, onAction }: { tripId: string; screen: string; premium?: boolean; onAction: RunAction }) {
  const c = useTheme(); const [open, setOpen] = useState(false);
  const tabs = mobileTripTabs(tripId), selected = activeTab(screen);
  const go = (to: MobileTarget) => { setOpen(false); onAction({ label: "Open trip section", to }); };
  const more: { label: string; icon: IconName; to: MobileTarget }[] = [
    { label: "Packing & prep", icon: "bag-handle-outline", to: { screen: "packing", tripId } },
    { label: "Events nearby", icon: "musical-notes-outline", to: { screen: "events", tripId } },
    { label: "Group voting", icon: "hand-left-outline", to: { screen: "votes", tripId } },
    { label: "Travelers & sharing", icon: "people-outline", to: { screen: "sharing", tripId } },
    { label: "Trip settings", icon: "settings-outline", to: { screen: "settings", tripId } },
    { label: "Premium pass", icon: "sparkles-outline", to: { screen: "premium", tripId } },
    { label: "History & undo", icon: "time-outline", to: { screen: "versions", tripId } },
    ...(premium ? [{ label: "Trip assistant", icon: "chatbubble-ellipses-outline" as IconName, to: { screen: "assistant", tripId } }] : []),
  ];
  const tab = (id: string, label: string, icon: IconName, activeIcon: IconName, onPress: () => void, locked = false) => {
    const on = selected === id;
    return <Pressable key={id} accessibilityRole="tab" accessibilityLabel={`${label}${locked ? ", Premium" : ""}`} accessibilityState={{ selected: on }} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 54, alignItems: "center", justifyContent: "center", gap: 3, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 14, backgroundColor: on ? c.soft : "transparent" }}><Ionicons name={on ? activeIcon : icon} size={21} color={on ? c.accent : c.muted} />{locked && <View style={{ position: "absolute", right: 8, top: 1 }}><Ionicons name="sparkles" size={9} color={c.coral} /></View>}</View>
      <T style={{ fontSize: 10, lineHeight: 13, fontFamily: on ? "InterSemibold" : "Inter", color: on ? c.accent : c.muted }}>{label}</T>
    </Pressable>;
  };
  return <><View accessibilityRole="tablist" accessibilityLabel="Trip sections" style={{ flexShrink: 0, backgroundColor: c.tabBar, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, flexDirection: "row", paddingHorizontal: 6, paddingTop: 2 }}>
    {TABS.map((t, i) => tab(t.id, t.label, t.icon, t.active, () => { if (screen !== t.id) go(tabs[i].to); }, !premium && !!tabs[i].premium))}
    {tab("more", "More", "grid-outline", "grid", () => setOpen(true))}
  </View><Sheet open={open} title="Your trip" close={() => setOpen(false)}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{more.map(item => <Pressable key={item.to.screen} accessibilityRole="button" onPress={() => go(item.to)} style={({ pressed }) => ({ width: "31%", flexGrow: 1, minHeight: 92, borderRadius: 18, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", gap: 8, padding: 10, opacity: pressed ? 0.7 : 1 })}><Ionicons name={item.icon} size={24} color={c.accent} /><T style={{ fontSize: 12, lineHeight: 16, textAlign: "center", fontFamily: "InterSemibold" }}>{item.label}</T></Pressable>)}</View>
  </Sheet></>;
}
