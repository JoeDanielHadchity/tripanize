import { Tabs } from "expo-router";
import { useTheme } from "../../components/theme";
import { Icon } from "../../components/ui";
export default function TabLayout() {
  const c = useTheme();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.muted,
    sceneStyle: { backgroundColor: c.bg }, tabBarStyle: { backgroundColor: c.paper, borderTopColor: c.line }, tabBarLabelStyle: { fontFamily: "InterSemibold", fontSize: 11 } }}>
    <Tabs.Screen name="index" options={{ title: "Start", tabBarIcon: ({ color }) => <Icon name="compass-outline" color={color} /> }} />
    <Tabs.Screen name="trips" options={{ title: "My trips", tabBarIcon: ({ color }) => <Icon name="briefcase-outline" color={color} /> }} />
    <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color }) => <Icon name="person-circle-outline" color={color} /> }} />
  </Tabs>;
}
