import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/** Height of the Android keyboard above the navigation bar, or 0 when it is closed.
 * Android 15+ draws apps edge to edge, so the window no longer shrinks for the
 * keyboard; the root layout pads itself by this much instead. iOS keeps using
 * KeyboardAvoidingView, so this stays 0 there. */
export function useAndroidKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const shown = Keyboard.addListener("keyboardDidShow", e => setHeight(Math.max(0, Math.round(e.endCoordinates.height))));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  return height;
}
