import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

// Brand palette (cream, ink, slate teal, coral) plus surface tokens for the native shell.
const light = { bg: "#f6f2e9", paper: "#fffdf8", raised: "#ffffff", ink: "#172e33", muted: "#5b6b6e", accent: "#3f6d83", accentText: "#ffffff", soft: "#e3edf0", line: "#e4dfd3", coral: "#b55a3c", coralSoft: "#f6e3da", danger: "#a33030", success: "#2f7a5b", tabBar: "#fffdf8", shadow: "rgba(23, 46, 51, 0.08)", dark: false };
const dark: typeof light = { bg: "#161a1e", paper: "#21272c", raised: "#283037", ink: "#f6f2e9", muted: "#a9b8bc", accent: "#a4c5cf", accentText: "#172e33", soft: "#2c3f46", line: "#353f44", coral: "#efaf91", coralSoft: "#4a3029", danger: "#ffb8ab", success: "#8fd3b3", tabBar: "#1d2227", shadow: "rgba(0, 0, 0, 0.35)", dark: true };
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
