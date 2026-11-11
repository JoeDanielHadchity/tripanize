import { useEffect, useRef, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { View } from "react-native";
import { Stack, router, useGlobalSearchParams, usePathname } from "expo-router";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "../components/theme";
import { authClient } from "../lib/auth";
import { pendingSignIn } from "../lib/pending-sign-in";
import { NativeBottomNavigation } from "../components/bottom-navigation";
import { isMobileTripRoute } from "../../../src/lib/mobile-public";
import { Loading, Screen } from "../components/ui";
import { Intro } from "../components/intro";
import { onPushOpen, syncPush } from "../lib/push";
import { recoverPurchases } from "../lib/purchases";
import { workspaceHref } from "../lib/workspace";
import { useAndroidKeyboardHeight } from "../lib/keyboard";
export { ErrorBoundary } from "expo-router";

// Keep the launch screen up until the intro has drawn its first frame over it.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

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

/** If Android closed the app while someone was fetching their code, reopen the code screen. */
function useResumeSignIn(signedOut: boolean) {
  const checked = useRef(false);
  useEffect(() => {
    if (!signedOut || checked.current) return;
    checked.current = true;
    void pendingSignIn().then(p => { if (p) router.push("/sign-in"); });
  }, [signedOut]);
}

function Navigation() {
  const { data: session, isPending } = authClient.useSession();
  const [loaded, error] = useFonts({ ...Ionicons.font, Nunito: require("../../assets/fonts/Manrope-Medium.ttf"), NunitoBold: require("../../assets/fonts/Manrope-ExtraBold.ttf"), NunitoHeading: require("../../assets/fonts/BricolageGrotesque-ExtraBold.ttf") });
  // Design 004 fonts under the original keys: body Manrope, headings Bricolage Grotesque.
  const c = useTheme();
  const pathname = usePathname(), params = useGlobalSearchParams<{ tripId?: string | string[] }>();
  const inTrip = isMobileTripRoute(pathname, params.tripId);
  // Android draws edge to edge, so lift the whole screen above the keyboard ourselves and
  // tuck the tab bar away while typing (it would otherwise sit on top of the keyboard).
  const keyboard = useAndroidKeyboardHeight();
  useSignedInDevice(session?.user.id);
  // Only the very first session check holds the app. Later checks (the app re-checks the session
  // whenever it comes back to the front) must not unmount the screens: that used to throw people
  // back to Home while they fetched their sign-in code from their email app.
  const [started, setStarted] = useState(false);
  if (!isPending && !started) setStarted(true);
  useResumeSignIn(started && !session);
  if ((!loaded && !error) || !started) return <Screen><Loading /></Screen>;
  return <SafeAreaView edges={inTrip || keyboard ? ["top", "bottom"] : ["top"]} style={{ flex: 1, backgroundColor: c.bg }}><StatusBar style={c.dark ? "light" : "dark"} /><View style={{ flex: 1, paddingBottom: keyboard }}><Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: c.bg } }}>
    <Stack.Screen name="(tabs)" options={{ animation: "none" }} /><Stack.Screen name="sign-in" options={{ animation: "slide_from_bottom" }} /><Stack.Screen name="plans" /><Stack.Screen name="feature/[slug]" /><Stack.Screen name="guide/[slug]" />
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="start" options={{ animation: "slide_from_bottom" }} /><Stack.Screen name="trip/[id]" /><Stack.Screen name="destinations" /><Stack.Screen name="workspace" />
    </Stack.Protected>
    <Stack.Screen name="offline" />
  </Stack></View>{!keyboard && <NativeBottomNavigation />}</SafeAreaView>;
}
export default function RootLayout() {
  const [intro, setIntro] = useState(true);
  const [done] = useState(() => () => setIntro(false));
  return <SafeAreaProvider><ThemeProvider><View style={{ flex: 1 }}><Navigation />{intro && <Intro onDone={done} />}</View></ThemeProvider></SafeAreaProvider>;
}
