import { Linking, Pressable, ScrollView, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { router, usePathname } from "expo-router";
import { workspaceHref } from "../lib/workspace";
import { authClient } from "../lib/auth";
import { Brand, Button, Icon, T, styles } from "./ui";
import { useAppearance, useTheme } from "./theme";
import { FEATURE_PAGES } from "../../../src/lib/feature-pages";

export function NativeLegalLinks() {
  const c = useTheme(); const [error, setError] = useState(false);
  return <View style={{ gap: 8 }}><View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>{["Terms", "Privacy", "Refunds", "Contact"].map(label => <Pressable key={label} accessibilityRole="link" onPress={() => void Linking.openURL(`https://www.tripanize.app/${label.toLowerCase()}`).catch(() => setError(true))} style={{ paddingVertical: 12 }}><T style={{ color: c.muted, fontSize: 12 }}>{label} ↗</T></Pressable>)}</View>{error && <T accessibilityRole="alert">Could not open the page. Please try again.</T>}</View>;
}

export function CreateTripButton({ secondary = false }: { secondary?: boolean }) {
  const { data: session } = authClient.useSession();
  return <Button secondary={secondary} trailingIcon="arrow-forward" onPress={() => session ? router.push("/start") : router.push({ pathname: "/sign-in", params: { next: "start" } })}>Create a trip</Button>;
}

export function NativePublicHeader() {
  const c = useTheme(); const appearance = useAppearance();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const links = [{ label: "Home", slug: "home", path: "/", go: () => router.navigate("/") }, { label: "Plans", slug: "plans", path: "/plans", go: () => router.push("/plans") }, ...FEATURE_PAGES.map(f => ({ label: f.label, slug: f.href.slice(1), path: `/feature${f.href}`, go: () => router.push({ pathname: "/feature/[slug]", params: { slug: f.href.slice(1) } }) }))];
  const showMenu = links.some(link => link.path === pathname);
  const menu = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  useEffect(() => {
    if (showMenu) menu.current?.scrollTo({ x: Math.max(0, (positions.current[pathname] ?? 0) - 12), animated: false });
  }, [pathname, showMenu]);
  return <View style={{ gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.line }}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Home" onPress={() => router.navigate("/")}><Brand /></Pressable>
      {showMenu && <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={appearance.choice === "dark" ? "Switch to light mode" : "Switch to dark mode"} onPress={() => appearance.set(appearance.choice === "dark" ? "light" : "dark")} style={{ paddingVertical: 10 }}><Icon name={appearance.choice === "dark" ? "sunny-outline" : "moon-outline"} /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push(session ? "/trips" : "/sign-in")} style={{ paddingVertical: 10 }}><T style={{ color: c.accent, fontSize: 13, fontFamily: "InterSemibold" }}>{session ? "My trips" : "Sign in"}</T></Pressable>
      </View>}
      {!showMenu && session && <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push(workspaceHref({ screen: "notifications" }))} style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}><Icon name="notifications-outline" size={22} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Account" onPress={() => router.navigate("/account")} style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}><Icon name="person-circle-outline" size={24} /></Pressable></View>}
    </View>
    {showMenu && <ScrollView ref={menu} horizontal showsHorizontalScrollIndicator={false} bounces={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ alignItems: "center", gap: 18 }}>
      {links.map(link => <Pressable key={link.slug} accessibilityRole="button" accessibilityState={{ selected: link.path === pathname }} onPress={link.go} onLayout={event => {
        positions.current[link.path] = event.nativeEvent.layout.x;
        if (link.path === pathname) menu.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - 12), animated: false });
      }} style={{ flexShrink: 0, paddingVertical: 10, borderBottomWidth: link.path === pathname ? 2 : 0, borderBottomColor: c.accent }}><T numberOfLines={1} style={{ fontSize: 13, fontFamily: link.path === pathname ? "InterSemibold" : "Inter", color: c.accent }}>{link.label}</T></Pressable>)}
    </ScrollView>}
  </View>;
}
