import { createContext, useContext, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

const light = { bg: "#f6f2e9", paper: "#fffdf8", ink: "#172e33", muted: "#485a5d", accent: "#3f6d83", accentText: "#ffffff", soft: "#e3edf0", line: "#d9d5ca", coral: "#b55a3c", danger: "#a33030" };
const dark: typeof light = { bg: "#1c2025", paper: "#252b30", ink: "#f6f2e9", muted: "#b9c8cc", accent: "#a4c5cf", accentText: "#172e33", soft: "#30454d", line: "#414d51", coral: "#efaf91", danger: "#ffb8ab" };
const Theme = createContext(light);
type Appearance = "light" | "dark" | "system";
const AppearanceContext = createContext<{ choice: Appearance; set: (v: Appearance) => void }>({ choice: "light", set: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, set] = useState<Appearance>("light"); const system = useColorScheme();
  return <AppearanceContext.Provider value={{ choice, set }}><Theme.Provider value={choice === "dark" || choice === "system" && system === "dark" ? dark : light}>{children}</Theme.Provider></AppearanceContext.Provider>;
}
export const useTheme = () => useContext(Theme);
export const useAppearance = () => useContext(AppearanceContext);
