import { Tabs } from "expo-router";
import { useTheme } from "../../components/theme";

// The shared root layout owns the bottom bar for every route. Every tab opens
// for everyone; screens show a signed-out version when there is no session.
export default function MainPagesLayout() {
  const c = useTheme();
  return <Tabs tabBar={() => null} backBehavior="history" screenOptions={{ headerShown: false, animation: "fade", sceneStyle: { backgroundColor: c.bg } }}>
    <Tabs.Screen name="index" /><Tabs.Screen name="trips" /><Tabs.Screen name="inbox" /><Tabs.Screen name="account" />
  </Tabs>;
}
