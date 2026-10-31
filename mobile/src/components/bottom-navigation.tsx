import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, authClient } from "../lib/auth";
import { workspaceHref } from "../lib/workspace";
import { isMobileTripRoute, mobileNavigationSection } from "../../../src/lib/mobile-public";
import { T, type IconName } from "./ui";
import { useTheme } from "./theme";

type Tab = { id: "home" | "trips" | "inbox" | "account"; label: string; icon: IconName; active: IconName; go: () => void; auth: boolean };
const TABS: Tab[] = [
  { id: "home", label: "Home", icon: "compass-outline", active: "compass", go: () => router.navigate("/"), auth: false },
  { id: "trips", label: "Trips", icon: "airplane-outline", active: "airplane", go: () => router.navigate("/trips"), auth: true },
  { id: "inbox", label: "Inbox", icon: "notifications-outline", active: "notifications", go: () => router.navigate(workspaceHref({ screen: "notifications" })), auth: true },
  { id: "account", label: "You", icon: "person-circle-outline", active: "person-circle", go: () => router.navigate("/account"), auth: true },
];

/** Unread inbox count for the badge; refreshed on focus and every minute. */
function useUnread(signedIn: boolean, pathname: string) {
  const [unread, setUnread] = useState(0);
  const load = useCallback(() => { if (signedIn) void api<{ unread?: number }>("/api/mobile/session").then(r => setUnread(r.unread ?? 0)).catch(() => undefined); }, [signedIn]);
  useEffect(() => { if (!signedIn) return; load(); const timer = setInterval(() => { if (AppState.currentState === "active") load(); }, 60_000); const sub = AppState.addEventListener("change", s => { if (s === "active") load(); }); return () => { clearInterval(timer); sub.remove(); }; }, [signedIn, load]);
  useEffect(() => { load(); }, [pathname, load]);
  return signedIn ? unread : 0;
}

/** App-wide tab bar. Trip workspaces hide it and show their own section bar. */
export function NativeBottomNavigation() {
  const c = useTheme(); const pathname = usePathname();
  const params = useGlobalSearchParams<{ view?: string | string[]; tripId?: string | string[] }>();
  const { data: session } = authClient.useSession();
  const unread = useUnread(!!session, pathname);
  const selected = mobileNavigationSection(pathname, Array.isArray(params.view) ? params.view[0] : params.view);
  if (isMobileTripRoute(pathname, params.tripId)) return null;
  const open = (tab: Tab) => { if (tab.auth && !session) router.navigate({ pathname: "/sign-in", params: { next: tab.id === "inbox" ? "trips" : tab.id } }); else tab.go(); };
  const create = () => session ? router.push("/start") : router.push({ pathname: "/sign-in", params: { next: "start" } });
  const item = (tab: Tab) => {
    const on = tab.id === selected;
    return <Pressable key={tab.id} accessibilityRole="tab" accessibilityLabel={tab.id === "inbox" && unread ? `${tab.label}, ${unread} unread` : tab.label} accessibilityState={{ selected: on }} onPress={() => { if (!on) open(tab); }} style={({ pressed }) => ({ flex: 1, minHeight: 54, alignItems: "center", justifyContent: "center", gap: 3, opacity: pressed ? 0.6 : 1 })}>
      <View><Ionicons name={on ? tab.active : tab.icon} size={23} color={on ? c.accent : c.muted} />{tab.id === "inbox" && unread > 0 && <View style={{ position: "absolute", top: -3, right: -8, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: c.coral, alignItems: "center", justifyContent: "center" }}><T style={{ color: "#fff", fontSize: 9, lineHeight: 12, fontFamily: "InterSemibold" }}>{unread > 9 ? "9+" : unread}</T></View>}</View>
      <T style={{ fontFamily: on ? "InterSemibold" : "Inter", fontSize: 10, lineHeight: 13, color: on ? c.accent : c.muted }}>{tab.label}</T>
    </Pressable>;
  };
  return <SafeAreaView edges={["bottom", "left", "right"]} style={{ flexShrink: 0, backgroundColor: c.tabBar, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
    <View accessibilityRole="tablist" accessibilityLabel="Main app navigation" style={{ width: "100%", maxWidth: 600, alignSelf: "center", flexDirection: "row", alignItems: "center", paddingHorizontal: 6 }}>
      {TABS.slice(0, 2).map(item)}
      <View style={{ flex: 1, alignItems: "center" }}><Pressable accessibilityRole="button" accessibilityLabel="Create a trip" onPress={create} style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, marginTop: -18, backgroundColor: c.coral, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.94 : 1 }], boxShadow: `0 6px 16px ${c.dark ? "rgba(0,0,0,0.5)" : "rgba(181,90,60,0.35)"}`, borderWidth: 4, borderColor: c.tabBar })}><Ionicons name="add" size={28} color="#fff" /></Pressable></View>
      {TABS.slice(2).map(item)}
    </View>
  </SafeAreaView>;
}
