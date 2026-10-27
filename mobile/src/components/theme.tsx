import { createContext, useContext, type ReactNode } from "react";
import { useColorScheme } from "react-native";

const light = { bg: "#f6f2e9", paper: "#fffdf8", ink: "#172e33", muted: "#485a5d", accent: "#3f6d83", accentText: "#ffffff", soft: "#e3edf0", line: "#d9ded8", coral: "#b55a3c", danger: "#a33030" };
const dark: typeof light = { bg: "#1c2025", paper: "#252b30", ink: "#f6f2e9", muted: "#b9c8cc", accent: "#a4c5cf", accentText: "#172e33", soft: "#30454d", line: "#414d51", coral: "#efaf91", danger: "#ffb8ab" };
const Theme = createContext(light);
export function ThemeProvider({ children }: { children: ReactNode }) { return <Theme.Provider value={useColorScheme() === "dark" ? dark : light}>{children}</Theme.Provider>; }
export const useTheme = () => useContext(Theme);
