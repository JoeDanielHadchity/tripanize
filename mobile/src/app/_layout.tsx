import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "../components/theme";
import { authClient } from "../lib/auth";
import { Loading, Screen } from "../components/ui";
export { ErrorBoundary } from "expo-router";

function Navigation() {
  const { data: session, isPending } = authClient.useSession();
  const [loaded, error] = useFonts({ Inter: require("../../assets/fonts/Inter-Regular.ttf"), InterSemibold: require("../../assets/fonts/Inter-SemiBold.ttf"), Fraunces: require("../../assets/fonts/Fraunces-SemiBold.ttf") });
  const c = useTheme();
  if ((!loaded && !error) || isPending) return <Screen><Loading /></Screen>;
  return <><StatusBar style={c.bg === "#f6f2e9" ? "dark" : "light"} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
    <Stack.Protected guard={!session}><Stack.Screen name="sign-in" /></Stack.Protected>
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="(tabs)" /><Stack.Screen name="trip/[id]" /><Stack.Screen name="destinations" /><Stack.Screen name="workspace" />
    </Stack.Protected>
    <Stack.Screen name="offline" />
  </Stack></>;
}
export default function RootLayout() { return <SafeAreaProvider><ThemeProvider><Navigation /></ThemeProvider></SafeAreaProvider>; }
