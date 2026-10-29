import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type TextProps, type ViewStyle, type StyleProp, type ColorValue } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./theme";

export function T({ style, ...props }: TextProps) { const c = useTheme(); return <Text {...props} style={[{ fontFamily: "Inter", fontSize: 15, lineHeight: 23, color: c.ink }, style]} />; }
export function Heading({ children, small = false }: { children: ReactNode; small?: boolean }) { return <T accessibilityRole="header" style={{ fontFamily: "Fraunces", fontSize: small ? 25 : 36, lineHeight: small ? 32 : 43, letterSpacing: -0.7 }}>{children}</T>; }
export function Button({ children, onPress, busy, disabled, secondary = false }: { children: ReactNode; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean }) {
  const c = useTheme(); return <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 54, borderRadius: 15, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, opacity: busy || disabled ? 0.55 : pressed ? 0.8 : 1, backgroundColor: secondary ? c.soft : c.accent })}>{busy ? <ActivityIndicator color={secondary ? c.accent : c.accentText} /> : <T style={{ fontFamily: "InterSemibold", color: secondary ? c.ink : c.accentText }}>{children}</T>}</Pressable>;
}
export function Screen({ children, header, scroll = true, style }: { children: ReactNode; header?: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useTheme(); return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: c.bg }}>
    {header && <View style={[styles.content, style, { paddingBottom: 0, gap: 0, flexShrink: 0, zIndex: 1, backgroundColor: c.bg }]}>{header}</View>}
    {scroll ? <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, style]}>{children}</ScrollView> : <View style={[styles.content, { flex: 1 }, style]}>{children}</View>}
  </SafeAreaView>;
}
export function Brand() { return <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Image accessibilityLabel="Tripanize" source={require("../../assets/mark.png")} style={{ width: 37, height: 37 }} contentFit="contain" /><T style={{ fontFamily: "InterSemibold", fontSize: 21, letterSpacing: -0.8 }}>Tripanize</T></View>; }
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) { const c = useTheme(); return <View style={[{ backgroundColor: c.paper, borderRadius: 20, borderWidth: 1, borderColor: c.line, padding: 20, gap: 12 }, style]}>{children}</View>; }
export function Eyebrow({ children }: { children: ReactNode }) { const c = useTheme(); return <T style={{ color: c.coral, fontSize: 11, fontFamily: "InterSemibold", letterSpacing: 2, textTransform: "uppercase" }}>{children}</T>; }
export function Muted({ children }: { children: ReactNode }) { const c = useTheme(); return <T style={{ color: c.muted, fontSize: 13, lineHeight: 20 }}>{children}</T>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { const c = useTheme(); return <View accessibilityRole="alert" style={{ padding: 18, borderRadius: 14, borderColor: c.danger, borderWidth: 1, gap: 12 }}><T style={{ color: c.danger }}>{message}</T>{retry && <Button onPress={retry} secondary>Try again</Button>}</View>; }
export function Loading() { const c = useTheme(); return <View style={{ padding: 50 }}><ActivityIndicator color={c.accent} accessibilityLabel="Loading" /></View>; }
export function Icon({ name, color, size = 22 }: { name: keyof typeof Ionicons.glyphMap; color?: ColorValue; size?: number }) { const c = useTheme(); return <Ionicons name={name} color={color ?? c.accent} size={size} />; }
export const styles = StyleSheet.create({ content: { width: "100%", maxWidth: 560, alignSelf: "center", padding: 24, paddingBottom: 40, gap: 22 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 } });
