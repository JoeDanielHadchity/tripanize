// Appearance preference, saved per device. "system" (no saved value) follows the device's light/dark setting.
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_KEY = "tripanize-theme";

// Runs in <head> before the first paint so a saved theme never flashes the wrong colors.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
