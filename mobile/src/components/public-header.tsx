import { Linking, Pressable, View } from "react-native";
import { useState } from "react";
import { router, usePathname } from "expo-router";
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
  return <Button secondary={secondary} onPress={() => session ? router.push("/start") : router.push({ pathname: "/sign-in", params: { next: "start" } })}>Create a trip →</Button>;
}

export function NativePublicHeader() {
  const c = useTheme(); const appearance = useAppearance();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const links = [{ label: "Home", slug: "home", path: "/", go: () => router.navigate("/") }, { label: "Plans", slug: "plans", path: "/plans", go: () => router.push("/plans") }, ...FEATURE_PAGES.map(f => ({ label: f.label, slug: f.href.slice(1), path: `/feature${f.href}`, go: () => router.push({ pathname: "/feature/[slug]", params: { slug: f.href.slice(1) } }) }))];
  const showMenu = links.some(link => link.path === pathname);
  return <View style={{ gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.line }}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Home" onPress={() => router.navigate("/")}><Brand /></Pressable>
      {showMenu && <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={appearance.choice === "dark" ? "Switch to light mode" : "Switch to dark mode"} onPress={() => appearance.set(appearance.choice === "dark" ? "light" : "dark")} style={{ paddingVertical: 10 }}><Icon name={appearance.choice === "dark" ? "sunny-outline" : "moon-outline"} /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push(session ? "/trips" : "/sign-in")} style={{ paddingVertical: 10 }}><T style={{ color: c.accent, fontSize: 13, fontFamily: "InterSemibold" }}>{session ? "My trips" : "Sign in"}</T></Pressable>
      </View>}
    </View>
    {showMenu && <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 2 }}>{links.map(link => <Pressable key={link.slug} accessibilityRole="button" accessibilityState={{ selected: link.path === pathname }} onPress={link.go} style={{ paddingVertical: 10, borderBottomWidth: link.path === pathname ? 2 : 0, borderBottomColor: c.accent }}><T style={{ fontSize: 13, fontFamily: link.path === pathname ? "InterSemibold" : "Inter", color: c.accent }}>{link.label}</T></Pressable>)}</View>}
  </View>;
}
