import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { tripDates } from "../lib/data";
import { mobileTripTabs, type MobileAction, type MobileTarget, type MobileWorkspace } from "../lib/workspace";
import { Button, Card, Heading, Icon, Muted, T, styles } from "./ui";
import { useTheme } from "./theme";

export type RunAction = (action: MobileAction) => void;

export function Chip({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  const c = useTheme();
  return <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: accent ? c.soft : c.bg }}><T style={{ fontSize: 12, lineHeight: 19, color: accent ? c.accent : c.muted }}>{children}</T></View>;
}

export function ActionRow({ actions, onAction, busy, primary = false }: { actions: MobileAction[]; onAction: RunAction; busy?: boolean; primary?: boolean }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{actions.map((action, i) => <Button key={`${action.label}-${i}`} compact secondary={!primary || i > 0} disabled={busy} onPress={() => onAction(action)}>{action.label}</Button>)}</View>;
}

export function ActionSheet({ label, actions, onAction, icon = "ellipsis-horizontal", busy = false }: { label: string; actions: MobileAction[]; onAction: RunAction; icon?: keyof typeof Ionicons.glyphMap; busy?: boolean }) {
  const c = useTheme(); const [open, setOpen] = useState(false);
  return <><Button compact secondary leadingIcon={icon} disabled={busy} onPress={() => setOpen(true)}>{label}</Button><Sheet open={open} title={label} close={() => setOpen(false)}>
    {actions.map((action, index) => <Pressable key={index} accessibilityRole="button" disabled={busy} onPress={() => { setOpen(false); onAction(action); }} style={({ pressed }) => ({ minHeight: 52, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c.line, opacity: pressed ? 0.65 : 1 })}><T style={{ color: action.danger ? c.danger : c.ink }}>{action.label}</T></Pressable>)}
  </Sheet></>;
}

export function Sheet({ open, title, close, children }: { open: boolean; title: string; close: () => void; children: ReactNode }) {
  const c = useTheme();
  return <Modal visible={open} transparent animationType="fade" onRequestClose={close}><View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={close} style={{ flex: 1 }} />
    <SafeAreaView edges={["bottom", "left", "right"]} accessibilityViewIsModal style={{ backgroundColor: c.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "80%", padding: 20 }}>
      <View style={styles.row}><Heading small>{title}</Heading><Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={close} style={{ minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" }}><Icon name="close-outline" /></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>{children}</ScrollView>
    </SafeAreaView>
  </View></Modal>;
}

export function TripSummary({ data, onAction }: { data: MobileWorkspace; onAction: RunAction }) {
  const c = useTheme();
  if (!data.trip) return null;
  return <View style={{ gap: 10 }}><View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
    <Pressable accessibilityRole="button" onPress={() => onAction({ label: "All trips", to: { screen: "trips" } })} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="arrow-back" size={18} /><Muted>All trips</Muted></Pressable>
    <Chip accent>{data.premium ? "Premium trip" : "Standard trip"}</Chip><Muted>{data.role === "OWNER" ? "Organizer" : data.role === "COLLABORATOR" ? "Editor" : "Viewer"}</Muted>
  </View><Card style={{ backgroundColor: c.soft, gap: 7, paddingVertical: 20 }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2 }}>{data.trip.destinations.map((destination, i) => <View key={`${destination}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>{i > 0 && <Icon name="arrow-forward" size={13} />}<Muted>{destination}</Muted></View>)}</View>
    <T style={{ fontFamily: "Fraunces", fontSize: 28, lineHeight: 35 }}>{data.trip.name}</T><Muted>{tripDates(data.trip.startDate, data.trip.endDate)}</Muted>
  </Card></View>;
}

const icons = ["list-outline", "cash-outline", "chatbubble-outline", "calendar-outline"] as const;
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
  return <><View accessibilityRole="tablist" accessibilityLabel="Trip sections" style={{ flexShrink: 0, backgroundColor: c.paper, borderTopWidth: 1, borderTopColor: c.line, flexDirection: "row", paddingHorizontal: 4 }}>
    {tabs.slice(0, 4).map((tab, i) => <Pressable key={tab.to.screen} accessibilityRole="tab" accessibilityLabel={`${tab.label}${tab.premium ? ", Premium" : ""}`} accessibilityState={{ selected: selected === tab.to.screen }} onPress={() => { if (screen !== tab.to.screen) go(tab.to); }} style={({ pressed }) => ({ flex: 1, minHeight: 66, alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 8, paddingHorizontal: 2, opacity: pressed ? 0.6 : 1 })}><View style={{ width: 29, alignItems: "center" }}><Icon name={icons[i]} size={21} color={selected === tab.to.screen ? c.accent : c.muted} />{tab.premium && <View style={{ position: "absolute", right: -5, top: -3 }}><Icon name="star" size={9} /></View>}</View><T style={{ fontSize: 10, lineHeight: 14, textAlign: "center", fontFamily: selected === tab.to.screen ? "InterSemibold" : "Inter", color: selected === tab.to.screen ? c.accent : c.muted }}>{tab.label}</T></Pressable>)}
    <Pressable accessibilityRole="tab" accessibilityLabel="More trip sections" accessibilityState={{ selected: selected === "more" }} onPress={() => setOpen(true)} style={{ flex: 0.7, minHeight: 66, alignItems: "center", justifyContent: "center", gap: 3 }}><Icon name="ellipsis-horizontal" size={21} color={selected === "more" ? c.accent : c.muted} /><T style={{ fontSize: 10, lineHeight: 14, color: c.muted }}>More</T></Pressable>
  </View><Sheet open={open} title="Your trip" close={() => setOpen(false)}>
    {[...tabs.slice(4), { label: "Group voting", to: { screen: "votes", tripId } }, { label: "Travelers & sharing", to: { screen: "sharing", tripId } }, { label: "History & undo", to: { screen: "versions", tripId } }, ...(premium ? [{ label: "Trip assistant", to: { screen: "assistant", tripId } }] : [])].map(tab => <Pressable key={tab.to.screen} accessibilityRole="button" onPress={() => go(tab.to)} style={{ minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: c.line }}><T>{tab.label}</T><Icon name="chevron-forward" size={18} /></Pressable>)}
  </Sheet></>;
}
