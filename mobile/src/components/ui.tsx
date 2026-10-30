import type { ReactNode, Ref } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextProps, type ViewStyle, type StyleProp, type ColorValue } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./theme";

// The bundled brand fonts omit arrows. Keep real Unicode text for copying and
// screen readers, but draw those characters with the platform's system font.
function withArrowFont(children: ReactNode): ReactNode {
  if (typeof children === "string") return children.split(/([\u2190-\u21ff])/u).map((part, i) => /^[\u2190-\u21ff]$/u.test(part) ? <Text key={i} style={{ fontFamily: Platform.OS === "ios" ? "System" : "sans-serif" }}>{part}</Text> : part);
  if (Array.isArray(children)) return children.map(withArrowFont);
  return children;
}
export function T({ style, children, ...props }: TextProps) { const c = useTheme(); return <Text {...props} style={[{ fontFamily: "Inter", fontSize: 15, lineHeight: 23, color: c.ink }, style]}>{withArrowFont(children)}</Text>; }
export function Heading({ children, small = false }: { children: ReactNode; small?: boolean }) {
  const c = useTheme(); const marker = typeof children === "string" ? /^([★✓])\s*/u.exec(children) : null;
  const label = <T accessibilityRole="header" style={{ flexShrink: 1, fontFamily: "Fraunces", fontSize: small ? 25 : 36, lineHeight: small ? 32 : 43, letterSpacing: -0.7 }}>{marker ? (children as string).slice(marker[0].length) : children}</T>;
  return marker ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Ionicons accessible={false} name={marker[1] === "★" ? "star" : "checkmark"} color={c.accent} size={small ? 21 : 27} />{label}</View> : label;
}
export function Button({ children, onPress, busy, disabled, secondary = false, trailingIcon, leadingIcon, style, compact = false }: { children: ReactNode; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean; trailingIcon?: keyof typeof Ionicons.glyphMap; leadingIcon?: keyof typeof Ionicons.glyphMap; style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const c = useTheme(); const color = secondary ? c.ink : c.accentText;
  const marker = typeof children === "string" ? /^([★✓])\s*/u.exec(children) : null;
  const icon = leadingIcon ?? (marker ? marker[1] === "★" ? "star" : "checkmark" : undefined);
  const label = marker ? (children as string).slice(marker[0].length) : children;
  return <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={onPress} style={({ pressed }) => [{ minHeight: compact ? 44 : 52, borderRadius: 11, borderWidth: 1, borderColor: secondary ? c.line : c.accent, justifyContent: "center", alignItems: "center", paddingHorizontal: compact ? 12 : 18, opacity: busy || disabled ? 0.55 : pressed ? 0.8 : 1, backgroundColor: secondary ? c.paper : c.accent }, style]}>{busy ? <ActivityIndicator color={secondary ? c.accent : c.accentText} /> : <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>{icon && <Ionicons accessible={false} name={icon} color={color} size={19} />}<T style={{ fontFamily: "InterSemibold", fontSize: compact ? 14 : 15, lineHeight: compact ? 22 : 23, color, flexShrink: 1, textAlign: "center" }}>{label}</T>{trailingIcon && <Ionicons accessible={false} name={trailingIcon} color={color} size={19} />}</View>}</Pressable>;
}
export function Screen({ children, scroll = true, style, scrollRef }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle>; scrollRef?: Ref<ScrollView> }) {
  const c = useTheme(); return <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: c.bg }}>
    {scroll ? <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, style]}>{children}</ScrollView> : <View style={[styles.content, { flex: 1 }, style]}>{children}</View>}
  </SafeAreaView>;
}
export function Brand() {
  const c = useTheme();
  return <View accessible accessibilityRole="image" accessibilityLabel="Tripanize" style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "transparent" }}>
    <Image accessible={false} source={require("../../assets/mark.png")} style={{ width: 37, height: 37, backgroundColor: "transparent" }} contentFit="contain" />
    <Image accessible={false} source={require("../../assets/wordmark.png")} tintColor={c.ink} style={{ width: 95, height: 24, backgroundColor: "transparent" }} contentFit="contain" />
  </View>;
}
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) { const c = useTheme(); return <View style={[{ backgroundColor: c.paper, borderRadius: 15, borderWidth: 1, borderColor: c.line, padding: 18, gap: 12 }, style]}>{children}</View>; }
export function Eyebrow({ children }: { children: ReactNode }) { const c = useTheme(); return <T style={{ color: c.coral, fontSize: 11, fontFamily: "InterSemibold", letterSpacing: 2, textTransform: "uppercase" }}>{children}</T>; }
export function Muted({ children }: { children: ReactNode }) { const c = useTheme(); return <T style={{ color: c.muted, fontSize: 13, lineHeight: 20 }}>{children}</T>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { const c = useTheme(); return <View accessibilityRole="alert" style={{ padding: 18, borderRadius: 14, borderColor: c.danger, borderWidth: 1, gap: 12 }}><T style={{ color: c.danger }}>{message}</T>{retry && <Button onPress={retry} secondary>Try again</Button>}</View>; }
export function Loading() { const c = useTheme(); return <View style={{ padding: 50 }}><ActivityIndicator color={c.accent} accessibilityLabel="Loading" /></View>; }
export function Icon({ name, color, size = 22 }: { name: keyof typeof Ionicons.glyphMap; color?: ColorValue; size?: number }) { const c = useTheme(); return <Ionicons name={name} color={color ?? c.accent} size={size} />; }
export const styles = StyleSheet.create({ content: { width: "100%", maxWidth: 560, alignSelf: "center", padding: 24, paddingBottom: 40, gap: 22 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 } });
