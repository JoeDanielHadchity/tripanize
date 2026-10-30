import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { authClient } from "../lib/auth";
import { isMobileTripRoute, mobileNavigationSection } from "../../../src/lib/mobile-public";
import { Icon, T } from "./ui";
import { useTheme } from "./theme";

const ITEMS = [
  { id: "home", label: "Home", href: "/", icon: "home-outline" },
  { id: "trips", label: "My trips", href: "/trips", icon: "briefcase-outline" },
  { id: "account", label: "Account", href: "/account", icon: "person-circle-outline" },
] as const;

/** Global navigation stays outside trip workspaces, which own their compact bar. */
export function NativeBottomNavigation() {
  const c = useTheme(); const pathname = usePathname();
  const params = useGlobalSearchParams<{ view?: string | string[]; tripId?: string | string[] }>();
  const { data: session } = authClient.useSession();
  const selected = mobileNavigationSection(pathname, Array.isArray(params.view) ? params.view[0] : params.view);
  if (isMobileTripRoute(pathname, params.tripId)) return null;
  const items = ITEMS.filter(item => item.id !== "account" || !!session);
  return <SafeAreaView edges={["bottom", "left", "right"]} style={{ flexShrink: 0, backgroundColor: c.paper, borderTopWidth: 1, borderTopColor: c.line }}>
    <View accessibilityRole="tablist" accessibilityLabel="Main app navigation" style={{ width: "100%", maxWidth: 640, alignSelf: "center", flexDirection: "row" }}>{items.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: item.id === selected }} onPress={() => {
      if (pathname === item.href) return;
      if (item.id !== "home" && !session) router.navigate({ pathname: "/sign-in", params: { next: item.id } });
      else router.navigate(item.href);
    }} style={({ pressed }) => ({ flex: 1, minHeight: 52, paddingTop: 6, paddingBottom: 6, alignItems: "center", justifyContent: "center", gap: 2, opacity: pressed ? 0.65 : 1 })}>
      <Icon name={item.icon} color={item.id === selected ? c.accent : c.muted} size={21} /><T style={{ fontFamily: "InterSemibold", fontSize: 10, lineHeight: 14, color: item.id === selected ? c.accent : c.muted }}>{item.label}</T>
    </Pressable>)}</View>
  </SafeAreaView>;
}
