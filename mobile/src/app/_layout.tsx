import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Stack, router, useGlobalSearchParams, usePathname } from "expo-router";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "../components/theme";
import { authClient } from "../lib/auth";
import { NativeBottomNavigation } from "../components/bottom-navigation";
import { isMobileTripRoute } from "../../../src/lib/mobile-public";
import { Loading, Screen } from "../components/ui";
import { onPushOpen, syncPush } from "../lib/push";
import { recoverPurchases } from "../lib/purchases";
import { workspaceHref } from "../lib/workspace";
export { ErrorBoundary } from "expo-router";

/** Signed-in device work: refresh the push token, open tapped alerts, and apply
 * any store purchase that was paid but not yet confirmed. */
function useSignedInDevice(userId?: string) {
  const ready = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || ready.current === userId) return;
    ready.current = userId;
    void syncPush();
    void recoverPurchases();
  }, [userId]);
  useEffect(() => userId ? onPushOpen(target => router.push(target.screen === "trips" ? workspaceHref({ screen: "trips" }) : workspaceHref(target))) : undefined, [userId]);
}

function Navigation() {
  const { data: session, isPending } = authClient.useSession();
  const [loaded, error] = useFonts({ ...Ionicons.font, Inter: require("../../assets/fonts/Inter-Regular.ttf"), InterSemibold: require("../../assets/fonts/Inter-SemiBold.ttf"), Fraunces: require("../../assets/fonts/Fraunces-SemiBold.ttf") });
  const c = useTheme();
  const pathname = usePathname(), params = useGlobalSearchParams<{ tripId?: string | string[] }>();
  const inTrip = isMobileTripRoute(pathname, params.tripId);
  useSignedInDevice(session?.user.id);
  if ((!loaded && !error) || isPending) return <Screen><Loading /></Screen>;
  return <SafeAreaView edges={inTrip ? ["top", "bottom"] : ["top"]} style={{ flex: 1, backgroundColor: c.bg }}><StatusBar style={c.dark ? "light" : "dark"} /><View style={{ flex: 1 }}><Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: c.bg } }}>
    <Stack.Screen name="(tabs)" options={{ animation: "none" }} /><Stack.Screen name="sign-in" options={{ animation: "slide_from_bottom" }} /><Stack.Screen name="plans" /><Stack.Screen name="feature/[slug]" /><Stack.Screen name="guide/[slug]" />
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="start" options={{ animation: "slide_from_bottom" }} /><Stack.Screen name="trip/[id]" /><Stack.Screen name="destinations" /><Stack.Screen name="workspace" />
    </Stack.Protected>
    <Stack.Screen name="offline" />
  </Stack></View><NativeBottomNavigation /></SafeAreaView>;
}
export default function RootLayout() { return <SafeAreaProvider><ThemeProvider><Navigation /></ThemeProvider></SafeAreaProvider>; }
