import { authClient } from "../../lib/auth";
import { Stack } from "expo-router";
import { useTheme } from "../../components/theme";

// The shared root layout owns the bottom bar for every route.
export default function MainPagesLayout() {
  const c = useTheme(); const { data: session } = authClient.useSession();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
    <Stack.Screen name="index" />
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="trips" /><Stack.Screen name="account" />
    </Stack.Protected>
  </Stack>;
}
