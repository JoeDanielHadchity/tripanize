import { Linking, Pressable, View } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { authClient } from "../lib/auth";
import { Button, T } from "./ui";
import { useTheme } from "./theme";

export function NativeLegalLinks() {
  const c = useTheme(); const [error, setError] = useState(false);
  return <View style={{ gap: 8 }}><View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>{["Terms", "Privacy", "Refunds", "Contact"].map(label => <Pressable key={label} accessibilityRole="link" onPress={() => void Linking.openURL(`https://www.tripanize.app/${label.toLowerCase()}`).catch(() => setError(true))} style={{ paddingVertical: 12 }}><T style={{ color: c.muted, fontSize: 12 }}>{label} ↗</T></Pressable>)}</View>{error && <T accessibilityRole="alert">Could not open the page. Please try again.</T>}</View>;
}

export function CreateTripButton({ secondary = false, label = "Create a trip" }: { secondary?: boolean; label?: string }) {
  const { data: session } = authClient.useSession();
  return <Button secondary={secondary} leadingIcon="add" onPress={() => session ? router.push("/start") : router.push({ pathname: "/sign-in", params: { next: "start" } })}>{label}</Button>;
}
