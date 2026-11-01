import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";

// The route drawn on the suitcase, split into its dots and dashes in travel order.
const ROUTE = require("../../assets/intro/route.json") as { width: number; height: number; pieces: { x: number; y: number; w: number; h: number; dot: boolean }[] };
const PIECES = [
  require("../../assets/intro/route-00.png"), require("../../assets/intro/route-01.png"), require("../../assets/intro/route-02.png"), require("../../assets/intro/route-03.png"),
  require("../../assets/intro/route-04.png"), require("../../assets/intro/route-05.png"), require("../../assets/intro/route-06.png"), require("../../assets/intro/route-07.png"),
  require("../../assets/intro/route-08.png"), require("../../assets/intro/route-09.png"), require("../../assets/intro/route-10.png"), require("../../assets/intro/route-11.png"),
  require("../../assets/intro/route-12.png"), require("../../assets/intro/route-13.png"), require("../../assets/intro/route-14.png"), require("../../assets/intro/route-15.png"),
];
const BG = "#f6f2e9", INK = "#172e33";
// Same size and position as the native launch screen (splash imageWidth 110), so the handoff is invisible.
const MARK_W = 110, SCALE = MARK_W / ROUTE.width, MARK_H = ROUTE.height * SCALE;
const WORD_W = 118, WORD_H = WORD_W * 166 / 660, GAP = 12;
const KEY = "tripanize-intro-day";

/** Opening animation: the trip route draws itself across the suitcase, dot by
 * dot, then the wordmark slides in (about 4 s). Full version once a day, a quick one after
 * that, and none when the phone asks for reduced motion. Tap to skip. */
export function Intro({ onDone }: { onDone: () => void }) {
  const [pieces] = useState(() => ROUTE.pieces.map(() => new Animated.Value(0)));
  const [shift] = useState(() => new Animated.Value(0)), [word] = useState(() => new Animated.Value(0)), [fade] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let finished = false, current: Animated.CompositeAnimation | null = null;
    const finish = () => { if (finished) return; finished = true; onDone(); };
    const today = new Date().toDateString();
    void (async () => {
      const [reduced, seen] = await Promise.all([
        AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
        Promise.race([SecureStore.getItemAsync(KEY).catch(() => null), new Promise<null>(r => setTimeout(() => r(null), 300))]),
      ]);
      const quick = seen === today;
      void SecureStore.setItemAsync(KEY, today).catch(() => undefined);
      if (reduced) { pieces.forEach(p => p.setValue(1)); current = Animated.timing(fade, { toValue: 0, duration: 250, delay: 250, useNativeDriver: true }); current.start(finish); return; }
      const draw = Animated.stagger(quick ? 24 : 95, pieces.map((p, i) => Animated.timing(p, { toValue: 1, duration: quick ? 180 : 420, easing: ROUTE.pieces[i].dot ? Easing.out(Easing.back(3)) : Easing.out(Easing.back(1.6)), useNativeDriver: true })));
      const reveal = Animated.parallel([
        Animated.timing(shift, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(word, { toValue: 1, duration: 560, delay: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]);
      current = Animated.sequence(quick
        ? [Animated.delay(60), draw, Animated.timing(fade, { toValue: 0, duration: 250, delay: 150, useNativeDriver: true })]
        : [Animated.delay(250), draw, reveal, Animated.timing(fade, { toValue: 0, duration: 400, delay: 800, useNativeDriver: true })]);
      current.start(finish);
    })();
    return () => { finished = true; current?.stop(); };
  }, [pieces, shift, word, fade, onDone]);
  const skip = () => Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(onDone);
  // The mark moves left as the wordmark arrives, so the pair ends up centred.
  const markX = shift.interpolate({ inputRange: [0, 1], outputRange: [0, -(WORD_W + GAP) / 2] });
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: BG, opacity: fade, zIndex: 100, elevation: 100 }]} onLayout={() => void SplashScreen.hideAsync().catch(() => undefined)}>
    <Pressable accessibilityRole="button" accessibilityLabel="Tripanize. Tap to skip the intro" onPress={skip} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: MARK_W, height: MARK_H }}>
        <Animated.View style={{ width: MARK_W, height: MARK_H, transform: [{ translateX: markX }] }}>
          <Image source={require("../../assets/intro/base.png")} style={{ width: MARK_W, height: MARK_H }} contentFit="contain" />
          {ROUTE.pieces.map((p, i) => <Animated.View key={i} style={{ position: "absolute", left: p.x * SCALE, top: p.y * SCALE, width: p.w * SCALE, height: p.h * SCALE, opacity: pieces[i], transform: [{ scale: pieces[i].interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }}>
            <Image source={PIECES[i]} style={{ width: "100%", height: "100%" }} contentFit="fill" />
          </Animated.View>)}
        </Animated.View>
        <Animated.View style={{ position: "absolute", left: MARK_W + GAP - (WORD_W + GAP) / 2, top: (MARK_H - WORD_H) / 2, opacity: word, transform: [{ translateX: word.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}>
          <Image source={require("../../assets/wordmark.png")} tintColor={INK} style={{ width: WORD_W, height: WORD_H }} contentFit="contain" />
        </Animated.View>
      </View>
    </Pressable>
  </Animated.View>;
}
