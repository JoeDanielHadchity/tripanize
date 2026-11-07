import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, authClient } from "../lib/auth";
import { isMobileTripRoute, mobileNavigationSection } from "../../../src/lib/mobile-public";
import { T, type IconName } from "./ui";
import { useTheme } from "./theme";

type Tab = { id: "home" | "trips" | "inbox" | "account"; label: string; icon: IconName; active: IconName; go: () => void; auth: boolean };
const TABS: Tab[] = [
  { id: "home", label: "Home", icon: "compass-outline", active: "compass", go: () => router.navigate("/"), auth: false },
  { id: "trips", label: "Trips", icon: "airplane-outline", active: "airplane", go: () => router.navigate("/trips"), auth: false },
  { id: "inbox", label: "Inbox", icon: "notifications-outline", active: "notifications", go: () => router.navigate("/inbox"), auth: false },
  { id: "account", label: "You", icon: "person-circle-outline", active: "person-circle", go: () => router.navigate("/account"), auth: false },
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
  const item = (tab: Tab) => {
    const on = tab.id === selected;
    return <Pressable key={tab.id} accessibilityRole="tab" accessibilityLabel={tab.id === "inbox" && unread ? `${tab.label}, ${unread} unread` : tab.label} accessibilityState={{ selected: on }} onPress={() => { if (!on) open(tab); }} style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: 26, flexDirection: on ? "row" : "column", alignItems: "center", justifyContent: "center", gap: on ? 6 : 2, backgroundColor: on ? c.nightActive : "transparent", opacity: pressed ? 0.7 : 1 })}>
      <View><Ionicons name={on ? tab.active : tab.icon} size={on ? 19 : 21} color={on ? "#ffffff" : c.nightMuted} />{tab.id === "inbox" && unread > 0 && <View style={{ position: "absolute", top: -3, right: -8, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: c.nightAccent, alignItems: "center", justifyContent: "center" }}><T style={{ color: "#172e33", fontSize: 9, lineHeight: 12, fontFamily: "NunitoBold" }}>{unread > 9 ? "9+" : unread}</T></View>}</View>
      <T style={{ fontFamily: "NunitoBold", fontSize: on ? 13 : 12, lineHeight: 16, color: on ? "#ffffff" : c.nightMuted }}>{tab.label}</T>
    </Pressable>;
  };
  // Design 004: a floating dark pill. Creating a trip lives on Home and Trips, not in the bar.
  return <SafeAreaView edges={["bottom", "left", "right"]} style={{ flexShrink: 0, backgroundColor: c.bg, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8 }}>
    <View accessibilityRole="tablist" accessibilityLabel="Main app navigation" style={{ width: "100%", maxWidth: 560, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 4, padding: 6, borderRadius: 34, backgroundColor: c.night, boxShadow: `0 10px 26px ${c.dark ? "rgba(0,0,0,0.5)" : "rgba(23,46,51,0.28)"}` }}>
      {TABS.map(item)}
    </View>
  </SafeAreaView>;
}
