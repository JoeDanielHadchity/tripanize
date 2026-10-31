import type { ReactNode, Ref } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextProps, type ViewStyle, type StyleProp, type ColorValue } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "./theme";

export type IconName = keyof typeof Ionicons.glyphMap;

// The bundled brand fonts omit arrows. Keep real Unicode text for copying and
// screen readers, but draw those characters with the platform's system font.
function withArrowFont(children: ReactNode): ReactNode {
  if (typeof children === "string") return children.split(/([←-⇿])/u).map((part, i) => /^[←-⇿]$/u.test(part) ? <Text key={i} style={{ fontFamily: Platform.OS === "ios" ? "System" : "sans-serif" }}>{part}</Text> : part);
  if (Array.isArray(children)) return children.map(withArrowFont);
  return children;
}
export function T({ style, children, ...props }: TextProps) { const c = useTheme(); return <Text {...props} style={[{ fontFamily: "Inter", fontSize: 15, lineHeight: 22, color: c.ink }, style]}>{withArrowFont(children)}</Text>; }
export function Heading({ children, small = false }: { children: ReactNode; small?: boolean }) {
  const c = useTheme(); const marker = typeof children === "string" ? /^([★✓])\s*/u.exec(children) : null;
  const label = <T accessibilityRole="header" style={{ flexShrink: 1, fontFamily: "Fraunces", fontSize: small ? 22 : 32, lineHeight: small ? 28 : 38, letterSpacing: small ? -0.3 : -0.8 }}>{marker ? (children as string).slice(marker[0].length) : children}</T>;
  return marker ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Ionicons accessible={false} name={marker[1] === "★" ? "star" : "checkmark"} color={marker[1] === "★" ? c.coral : c.accent} size={small ? 19 : 25} />{label}</View> : label;
}

/** Shadow for raised surfaces; dark mode relies on the lighter surface instead. */
export function useElevation(level: 1 | 2 = 1): ViewStyle {
  const c = useTheme();
  if (c.dark) return { borderWidth: StyleSheet.hairlineWidth, borderColor: c.line };
  return { boxShadow: level === 1 ? `0 1px 2px ${c.shadow}, 0 4px 14px ${c.shadow}` : `0 2px 6px ${c.shadow}, 0 12px 28px ${c.shadow}` };
}

export function Button({ children, onPress, busy, disabled, secondary = false, trailingIcon, leadingIcon, style, compact = false, tone }: { children: ReactNode; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean; trailingIcon?: IconName; leadingIcon?: IconName; style?: StyleProp<ViewStyle>; compact?: boolean; tone?: "coral" | "danger" }) {
  const c = useTheme();
  const fill = secondary ? c.soft : tone === "coral" ? c.coral : tone === "danger" ? c.danger : c.accent;
  const color = secondary ? (tone === "danger" ? c.danger : c.ink) : tone ? "#ffffff" : c.accentText;
  const marker = typeof children === "string" ? /^([★✓])\s*/u.exec(children) : null;
  const icon = leadingIcon ?? (marker ? marker[1] === "★" ? "sparkles" : "checkmark" : undefined);
  const label = marker ? (children as string).slice(marker[0].length) : children;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || disabled, busy }} disabled={busy || disabled} onPress={onPress} style={({ pressed }) => [{ minHeight: compact ? 40 : 52, borderRadius: compact ? 20 : 16, justifyContent: "center", alignItems: "center", paddingHorizontal: compact ? 14 : 20, opacity: busy || disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }], backgroundColor: fill }, style]}>{busy ? <ActivityIndicator color={color} /> : <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}>{icon && <Ionicons accessible={false} name={icon} color={color} size={compact ? 16 : 18} />}<T style={{ fontFamily: "InterSemibold", fontSize: compact ? 13 : 15, lineHeight: compact ? 18 : 21, color, flexShrink: 1, textAlign: "center" }}>{label}</T>{trailingIcon && <Ionicons accessible={false} name={trailingIcon} color={color} size={compact ? 16 : 18} />}</View>}</Pressable>;
}

/** Round icon-only control with a 44pt touch target. */
export function IconButton({ name, label, onPress, filled = false, size = 44, color, badge, disabled, onImage = false }: { name: IconName; label: string; onPress: () => void; filled?: boolean; size?: number; color?: ColorValue; badge?: number; disabled?: boolean; onImage?: boolean }) {
  const c = useTheme();
  const bg = onImage ? "rgba(255,255,255,0.92)" : filled ? c.accent : c.paper;
  return <Pressable accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge} unread` : label} disabled={disabled} hitSlop={6} onPress={onPress} style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }, !filled && !onImage ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.line } : null]}>
    <Ionicons accessible={false} name={name} size={Math.round(size * 0.48)} color={color ?? (onImage ? "#172e33" : filled ? c.accentText : c.ink)} />
    {!!badge && <View style={{ position: "absolute", top: 2, right: 2, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: c.coral, alignItems: "center", justifyContent: "center" }}><T style={{ color: "#fff", fontSize: 10, lineHeight: 13, fontFamily: "InterSemibold" }}>{badge > 9 ? "9+" : badge}</T></View>}
  </Pressable>;
}

export function Screen({ children, scroll = true, style, scrollRef, refreshControl }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle>; scrollRef?: Ref<ScrollView>; refreshControl?: React.ComponentProps<typeof ScrollView>["refreshControl"] }) {
  const c = useTheme(); return <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: c.bg }}>
    {scroll ? <ScrollView ref={scrollRef} style={{ flex: 1 }} refreshControl={refreshControl} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, style]}>{children}</ScrollView> : <View style={[styles.content, { flex: 1 }, style]}>{children}</View>}
  </SafeAreaView>;
}

/** Large native title. Back appears on pushed screens; tab roots pass none. */
export function ScreenHeader({ title, subtitle, eyebrow, back, right }: { title: string; subtitle?: string; eyebrow?: string; back?: boolean | (() => void); right?: ReactNode }) {
  const goBack = typeof back === "function" ? back : () => router.canGoBack() ? router.back() : router.replace("/");
  return <View style={{ gap: 12, paddingTop: 4 }}>
    {(back || right) && <View style={styles.row}>{back ? <IconButton name="chevron-back" label="Back" onPress={goBack} /> : <View />}{right && <View style={{ flexDirection: "row", gap: 8 }}>{right}</View>}</View>}
    <View style={{ gap: 4 }}>{eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}<Heading>{title}</Heading>{subtitle && <Muted>{subtitle}</Muted>}</View>
  </View>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  const c = useTheme();
  return <View accessible accessibilityRole="image" accessibilityLabel="Tripanize" style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "transparent" }}>
    <Image accessible={false} source={require("../../assets/mark.png")} style={{ width: compact ? 30 : 36, height: compact ? 30 : 36, backgroundColor: "transparent" }} contentFit="contain" />
    {!compact && <Image accessible={false} source={require("../../assets/wordmark.png")} tintColor={c.ink} style={{ width: 95, height: 24, backgroundColor: "transparent" }} contentFit="contain" />}
  </View>;
}
export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const c = useTheme(); const elevation = useElevation();
  const base: ViewStyle = { backgroundColor: c.paper, borderRadius: 20, padding: 18, gap: 12, ...elevation };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, { transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}>{children}</Pressable>;
}
export function Eyebrow({ children, color }: { children: ReactNode; color?: ColorValue }) { const c = useTheme(); return <T style={{ color: color ?? c.coral, fontSize: 11, lineHeight: 15, fontFamily: "InterSemibold", letterSpacing: 1.6, textTransform: "uppercase" }}>{children}</T>; }
export function Muted({ children, style }: { children: ReactNode; style?: TextProps["style"] }) { const c = useTheme(); return <T style={[{ color: c.muted, fontSize: 13, lineHeight: 19 }, style]}>{children}</T>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { const c = useTheme(); return <View accessibilityRole="alert" style={{ padding: 16, borderRadius: 16, backgroundColor: c.coralSoft, gap: 12, flexDirection: "row", alignItems: "flex-start" }}><Ionicons name="alert-circle" size={20} color={c.danger} /><View style={{ flex: 1, gap: 10 }}><T style={{ color: c.dark ? c.ink : c.danger }}>{message}</T>{retry && <Button compact secondary onPress={retry} style={{ alignSelf: "flex-start" }}>Try again</Button>}</View></View>; }
export function Loading({ label = "Loading" }: { label?: string }) { const c = useTheme(); return <View style={{ padding: 48, alignItems: "center", gap: 12 }}><ActivityIndicator color={c.accent} accessibilityLabel={label} /></View>; }
export function Icon({ name, color, size = 22 }: { name: IconName; color?: ColorValue; size?: number }) { const c = useTheme(); return <Ionicons name={name} color={color ?? c.accent} size={size} />; }

/** Pill-style segmented control. */
export function Segmented<V extends string>({ value, options, onChange, label }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string }) {
  const c = useTheme();
  return <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: "row", backgroundColor: c.soft, borderRadius: 14, padding: 4, gap: 4 }}>
    {options.map(o => { const on = o.value === value; return <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={{ flex: 1, minHeight: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.paper : "transparent", ...(on && !c.dark ? { boxShadow: `0 1px 3px ${c.shadow}` } : {}) }}><T style={{ fontSize: 13, fontFamily: on ? "InterSemibold" : "Inter", color: on ? c.ink : c.muted }}>{o.label}</T></Pressable>; })}
  </View>;
}

/** Settings-style row: icon tile, title, subtitle and chevron or trailing control. */
export function ListRow({ icon, title, subtitle, onPress, trailing, tone, last = false }: { icon?: IconName; title: string; subtitle?: string; onPress?: () => void; trailing?: ReactNode; tone?: "danger" | "accent"; last?: boolean }) {
  const c = useTheme(); const color = tone === "danger" ? c.danger : c.accent;
  const body = <>
    {icon && <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: tone === "danger" ? c.coralSoft : c.soft, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={19} color={color} /></View>}
    <View style={{ flex: 1, gap: 1 }}><T style={{ fontFamily: "InterSemibold", fontSize: 15, color: tone === "danger" ? c.danger : c.ink }}>{title}</T>{subtitle && <Muted>{subtitle}</Muted>}</View>
    {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={c.muted} /> : null)}
  </>;
  const style: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 13, minHeight: 58, paddingVertical: 10, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line };
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}>{body}</Pressable> : <View style={style}>{body}</View>;
}

/** Labelled group of rows on one surface. */
export function Section({ title, action, children, flush = false }: { title?: string; action?: ReactNode; children: ReactNode; flush?: boolean }) {
  return <View style={{ gap: 10 }}>{(title || action) && <View style={[styles.row, { paddingHorizontal: 4 }]}>{title ? <T accessibilityRole="header" style={{ fontFamily: "InterSemibold", fontSize: 17 }}>{title}</T> : <View />}{action}</View>}{flush ? children : <Card style={{ paddingVertical: 4, gap: 0 }}>{children}</Card>}</View>;
}

/** Bottom-weighted dark scrim so white text stays readable on any photo. */
export function Scrim({ strength = 0.72 }: { strength?: number }) {
  const gradient = `linear-gradient(to bottom, rgba(10,22,26,0) 18%, rgba(10,22,26,${(strength * 0.55).toFixed(2)}) 55%, rgba(10,22,26,${strength}) 100%)`;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { experimental_backgroundImage: gradient } as ViewStyle, Platform.OS === "web" ? { backgroundImage: gradient } as ViewStyle : null]} />;
}

/** Full-bleed photo card with text laid over the image. */
export function PhotoCard({ source, height = 220, children, onPress, label, top, radius = 24, style, scrim = 0.72 }: { source?: ImageSource | string | null; height?: number; children?: ReactNode; onPress?: () => void; label: string; top?: ReactNode; radius?: number; style?: StyleProp<ViewStyle>; scrim?: number }) {
  const c = useTheme(); const elevation = useElevation(2);
  const inner = <>
    {source ? <Image source={source} accessible={false} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: c.accent }]}><Ionicons name="map" size={120} color="rgba(255,255,255,0.12)" style={{ position: "absolute", right: -16, top: -10 }} /></View>}
    <Scrim strength={scrim} />
    {top && <View style={{ position: "absolute", top: 14, left: 14, right: 14, flexDirection: "row", justifyContent: "space-between" }}>{top}</View>}
    <View style={{ padding: 18, gap: 4 }}>{children}</View>
  </>;
  const base: ViewStyle = { height, borderRadius: radius, overflow: "hidden", justifyContent: "flex-end", backgroundColor: c.soft, ...elevation };
  if (!onPress) return <View accessible accessibilityLabel={label} style={[base, style]}>{inner}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [base, { transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}>{inner}</Pressable>;
}
export function OnPhoto({ children, size = "body", style }: { children: ReactNode; size?: "title" | "body" | "small"; style?: TextProps["style"] }) {
  return <T style={[{ color: "#ffffff" }, size === "title" ? { fontFamily: "Fraunces", fontSize: 26, lineHeight: 31, letterSpacing: -0.4 } : size === "small" ? { fontSize: 12, lineHeight: 17, color: "rgba(255,255,255,0.86)" } : { fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.92)" }, style]}>{children}</T>;
}

/** Small rounded label; on photos it uses a frosted white surface. */
export function Badge({ children, icon, tone = "default", onImage = false }: { children: ReactNode; icon?: IconName; tone?: "default" | "accent" | "coral"; onImage?: boolean }) {
  const c = useTheme();
  const bg = onImage ? "rgba(255,255,255,0.9)" : tone === "accent" ? c.soft : tone === "coral" ? c.coralSoft : c.bg;
  const fg = onImage ? "#172e33" : tone === "coral" ? c.coral : tone === "accent" ? c.accent : c.muted;
  return <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: bg }}>{icon && <Ionicons name={icon} size={12} color={fg} />}<T style={{ fontSize: 12, lineHeight: 17, color: fg, fontFamily: "InterSemibold" }}>{children}</T></View>;
}

export function Avatar({ name, size = 40 }: { name?: string | null; size?: number }) {
  const c = useTheme(); const letter = (name?.trim()[0] ?? "T").toUpperCase();
  return <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.coral, alignItems: "center", justifyContent: "center" }}><T style={{ color: "#fff", fontFamily: "InterSemibold", fontSize: size * 0.42, lineHeight: size * 0.55 }}>{letter}</T></View>;
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  const c = useTheme();
  return <View style={{ alignItems: "center", gap: 10, paddingVertical: 36, paddingHorizontal: 20 }}><View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.soft, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={32} color={c.accent} /></View><T style={{ fontFamily: "Fraunces", fontSize: 22, lineHeight: 28, textAlign: "center" }}>{title}</T>{text && <Muted style={{ textAlign: "center" }}>{text}</Muted>}{action}</View>;
}

export const styles = StyleSheet.create({ content: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 20 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 } });
