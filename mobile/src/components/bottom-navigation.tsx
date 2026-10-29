import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { authClient } from "../lib/auth";
import { mobileNavigationSection } from "../../../src/lib/mobile-public";
import { Icon, T } from "./ui";
import { useTheme } from "./theme";

const ITEMS = [
  { id: "home", label: "Home", href: "/", icon: "home-outline" },
  { id: "trips", label: "My trips", href: "/trips", icon: "briefcase-outline" },
  { id: "account", label: "Account", href: "/account", icon: "person-circle-outline" },
] as const;

/** Lives outside the route stack, so pushed pages keep the same bottom bar. */
export function NativeBottomNavigation() {
  const c = useTheme(); const pathname = usePathname();
  const params = useGlobalSearchParams<{ screen?: string | string[] }>();
  const { data: session } = authClient.useSession();
  const selected = mobileNavigationSection(pathname, Array.isArray(params.screen) ? params.screen[0] : params.screen);
  return <SafeAreaView edges={["bottom", "left", "right"]} style={{ flexShrink: 0, backgroundColor: c.paper, borderTopWidth: 1, borderTopColor: c.line }}>
    <View accessibilityRole="tablist" accessibilityLabel="Main app navigation" style={{ width: "100%", maxWidth: 640, alignSelf: "center", flexDirection: "row" }}>{ITEMS.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: item.id === selected }} onPress={() => {
      if (item.id !== "home" && !session) router.navigate({ pathname: "/sign-in", params: { next: item.id } });
      else router.navigate(item.href);
    }} style={({ pressed }) => ({ flex: 1, minHeight: 64, paddingTop: 10, paddingBottom: 9, alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.65 : 1 })}>
      <Icon name={item.icon} color={item.id === selected ? c.accent : c.muted} size={23} /><T style={{ fontFamily: "InterSemibold", fontSize: 11, lineHeight: 16, color: item.id === selected ? c.accent : c.muted }}>{item.label}</T>
    </Pressable>)}</View>
  </SafeAreaView>;
}
