import { authClient } from "../../lib/auth";
import { Tabs } from "expo-router";
import { useTheme } from "../../components/theme";

// The shared root layout owns the bottom bar for every route.
export default function MainPagesLayout() {
  const c = useTheme(); const { data: session } = authClient.useSession();
  return <Tabs tabBar={() => null} backBehavior="none" screenOptions={{ headerShown: false, animation: "none", sceneStyle: { backgroundColor: c.bg } }}>
    <Tabs.Screen name="index" />
    <Tabs.Protected guard={!!session}>
      <Tabs.Screen name="trips" /><Tabs.Screen name="account" />
    </Tabs.Protected>
  </Tabs>;
}
