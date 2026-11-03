import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

// Design 004 (Night Pass in Design 001 colours): cream ground, deep ink ("night") for the
// bold pieces like tickets and the floating tab bar, teal for actions, coral only for AI.
const light = { bg: "#f6f2e9", paper: "#fffdf8", raised: "#ffffff", ink: "#172e33", muted: "#56656a", accent: "#0b6e74", accentText: "#ffffff", soft: "#e2f0ef", line: "#e6dfd0", coral: "#b4502d", coralSoft: "#fbe9e0", danger: "#a33030", success: "#2f7a5b", tabBar: "#172e33", night: "#172e33", nightInk: "#f6f2e9", nightMuted: "#a9bcbd", nightAccent: "#7fd1c9", nightLine: "#3b5358", nightActive: "#0f7f86", shadow: "rgba(23, 46, 51, 0.08)", dark: false };
const dark: typeof light = { bg: "#0f1e21", paper: "#172e33", raised: "#1f3a40", ink: "#f3efe6", muted: "#a9bcbd", accent: "#5fc4bb", accentText: "#0f1e21", soft: "#1d4044", line: "#2f4a50", coral: "#f4a27f", coralSoft: "#4a2c22", danger: "#ffb8ab", success: "#8fd3b3", tabBar: "#0a1a1d", night: "#0a1a1d", nightInk: "#f6f2e9", nightMuted: "#a9bcbd", nightAccent: "#7fd1c9", nightLine: "#2f4a50", nightActive: "#0f7f86", shadow: "rgba(0, 0, 0, 0.35)", dark: true };
export type Palette = typeof light;
const Theme = createContext(light);
type Appearance = "light" | "dark" | "system";
const AppearanceContext = createContext<{ choice: Appearance; set: (v: Appearance) => void }>({ choice: "light", set: () => {} });
const KEY = "tripanize-appearance";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<Appearance>("light"); const system = useColorScheme();
  useEffect(() => { void SecureStore.getItemAsync(KEY).then(v => { if (v === "light" || v === "dark" || v === "system") setChoice(v); }).catch(() => undefined); }, []);
  const set = (value: Appearance) => { setChoice(value); void SecureStore.setItemAsync(KEY, value).catch(() => undefined); };
  return <AppearanceContext.Provider value={{ choice, set }}><Theme.Provider value={choice === "dark" || choice === "system" && system === "dark" ? dark : light}>{children}</Theme.Provider></AppearanceContext.Provider>;
}
export const useTheme = () => useContext(Theme);
export const useAppearance = () => useContext(AppearanceContext);
