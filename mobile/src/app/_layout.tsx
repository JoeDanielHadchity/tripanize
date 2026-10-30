import { View } from "react-native";
import { Stack, useGlobalSearchParams, usePathname } from "expo-router";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "../components/theme";
import { authClient } from "../lib/auth";
import { NativePublicHeader } from "../components/public-header";
import { NativeBottomNavigation } from "../components/bottom-navigation";
import { isMobileTripRoute } from "../../../src/lib/mobile-public";
import { Loading, Screen, styles } from "../components/ui";
export { ErrorBoundary } from "expo-router";

function Navigation() {
  const { data: session, isPending } = authClient.useSession();
  const [loaded, error] = useFonts({ ...Ionicons.font, Inter: require("../../assets/fonts/Inter-Regular.ttf"), InterSemibold: require("../../assets/fonts/Inter-SemiBold.ttf"), Fraunces: require("../../assets/fonts/Fraunces-SemiBold.ttf") });
  const c = useTheme();
  const pathname = usePathname(), params = useGlobalSearchParams<{ tripId?: string | string[] }>();
  const inTrip = isMobileTripRoute(pathname, params.tripId);
  if ((!loaded && !error) || isPending) return <Screen><Loading /></Screen>;
  return <SafeAreaView edges={inTrip ? ["top", "bottom"] : ["top"]} style={{ flex: 1, backgroundColor: c.bg }}><StatusBar style={c.bg === "#f6f2e9" ? "dark" : "light"} /><View style={[styles.content, { paddingBottom: 0, gap: 0, flexShrink: 0 }]}><NativePublicHeader /></View><View style={{ flex: 1 }}><Stack screenOptions={{ headerShown: false, animation: "none", contentStyle: { backgroundColor: c.bg } }}>
    <Stack.Screen name="(tabs)" /><Stack.Screen name="sign-in" /><Stack.Screen name="plans" /><Stack.Screen name="feature/[slug]" /><Stack.Screen name="guide/[slug]" />
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="start" /><Stack.Screen name="trip/[id]" /><Stack.Screen name="destinations" /><Stack.Screen name="workspace" />
    </Stack.Protected>
    <Stack.Screen name="offline" />
  </Stack></View><NativeBottomNavigation /></SafeAreaView>;
}
export default function RootLayout() { return <SafeAreaProvider><ThemeProvider><Navigation /></ThemeProvider></SafeAreaProvider>; }
