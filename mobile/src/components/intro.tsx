import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";

type Box = { x: number; y: number; w: number; h: number };
// The logo split into its pieces: three map panels, the handle, and the route's dots and dashes in travel order.
const ROUTE = require("../../assets/intro/route.json") as { width: number; height: number; pieces: (Box & { dot: boolean })[]; parts: Record<"handle" | "left" | "middle" | "right", Box> };
const PIECES = [
  require("../../assets/intro/route-00.png"), require("../../assets/intro/route-01.png"), require("../../assets/intro/route-02.png"), require("../../assets/intro/route-03.png"),
  require("../../assets/intro/route-04.png"), require("../../assets/intro/route-05.png"), require("../../assets/intro/route-06.png"), require("../../assets/intro/route-07.png"),
  require("../../assets/intro/route-08.png"), require("../../assets/intro/route-09.png"), require("../../assets/intro/route-10.png"), require("../../assets/intro/route-11.png"),
  require("../../assets/intro/route-12.png"), require("../../assets/intro/route-13.png"), require("../../assets/intro/route-14.png"), require("../../assets/intro/route-15.png"),
];
const PART_IMAGES = { handle: require("../../assets/intro/part-handle.png"), left: require("../../assets/intro/part-left.png"), middle: require("../../assets/intro/part-middle.png"), right: require("../../assets/intro/part-right.png") };
const BG = "#f6f2e9", INK = "#172e33";
// Same size and position as the native launch screen (splash imageWidth 110, showing the folded map), so the handoff is invisible.
const MARK_W = 110, SCALE = MARK_W / ROUTE.width, MARK_H = ROUTE.height * SCALE;
const WORD_W = 190, WORD_H = WORD_W * 166 / 660, GAP = 16;
// Line the name up on the suitcase body: the middle of its capitals (cap top to baseline,
// rows 10-136 of the 166-high wordmark) sits on the middle of the body (rows 69-409 of the mark).
const BODY_MID = (ROUTE.parts.left.y + ROUTE.height) / 2 * SCALE, WORD_TOP = BODY_MID - WORD_H * 73 / 166;
// The boarding pass under the name: as wide as the logo + name, and the whole group rises to stay centred.
const LOCK_W = MARK_W + GAP + WORD_W, LINE_H = 28, LINE_GAP = 22, LIFT = (LINE_GAP + LINE_H) / 2;
const CORAL = "#b55a3c", TAGLINE = "Your trip organizer";
// The plane tows the tagline in on a short line: it eases to a stop by RELEASE, then the plane lets go and climbs away.
const RELEASE = 0.55, TOW = 34, SAMPLES = Array.from({ length: 11 }, (_, k) => RELEASE * k / 10);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const KEY = "tripanize-intro-day";
const box = (b: Box) => ({ position: "absolute" as const, left: b.x * SCALE, top: b.y * SCALE, width: b.w * SCALE, height: b.h * SCALE });
const timing = (value: Animated.Value, duration: number, easing: (t: number) => number, delay = 0) => Animated.timing(value, { toValue: 1, duration, delay, easing, useNativeDriver: true });

/** Opening animation (about 7 s): a folded map opens its two side panels, the
 * handle drops on top and it becomes the suitcase, the trip route draws itself
 * dot by dot and the wordmark slides in. Then a plane tows "Your trip organizer"
 * in from the left on a little line, lets it go under the name and climbs away.
 * Quicker after the first open each day, none with reduced motion. Tap to skip. */
export function Intro({ onDone }: { onDone: () => void }) {
  const [v] = useState(() => ({ left: new Animated.Value(0), right: new Animated.Value(0), handle: new Animated.Value(0), word: new Animated.Value(0), shift: new Animated.Value(0), fly: new Animated.Value(0), fade: new Animated.Value(1), pieces: ROUTE.pieces.map(() => new Animated.Value(0)) }));
  // Wait until the folded map has actually been drawn before dropping the launch screen and starting.
  const [ready, setReady] = useState(false);
  const [textW, setTextW] = useState(185);
  useEffect(() => { const t = setTimeout(() => setReady(true), 900); return () => clearTimeout(t); }, []);
  useEffect(() => { if (ready) void SplashScreen.hideAsync().catch(() => undefined); }, [ready]);
  useEffect(() => {
    if (!ready) return;
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
      if (reduced) {
        [v.left, v.right, v.handle, ...v.pieces].forEach(p => p.setValue(1));
        current = Animated.timing(v.fade, { toValue: 0, duration: 250, delay: 250, useNativeDriver: true }); current.start(finish); return;
      }
      const s = quick ? 0.35 : 1; // the quick version runs the same story at about a third of the time
      const unfold = Animated.parallel([timing(v.left, 650 * s, Easing.out(Easing.back(1.2))), timing(v.right, 650 * s, Easing.out(Easing.back(1.2)), 130 * s)]);
      const handle = timing(v.handle, 480 * s, Easing.out(Easing.back(2.2)));
      const draw = Animated.stagger(70 * s, v.pieces.map((p, i) => timing(p, 360 * s, Easing.out(Easing.back(ROUTE.pieces[i].dot ? 3 : 1.6)))));
      const reveal = Animated.parallel([timing(v.shift, 700, Easing.inOut(Easing.cubic)), timing(v.word, 560, Easing.out(Easing.cubic), 160)]);
      const fly = Animated.timing(v.fly, { toValue: 1, duration: 1900, delay: 450, easing: Easing.linear, useNativeDriver: true });
      const out = (delay: number, duration: number) => Animated.timing(v.fade, { toValue: 0, duration, delay, useNativeDriver: true });
      current = Animated.sequence(quick
        ? [unfold, handle, draw, out(150, 250)]
        : [Animated.delay(200), unfold, Animated.delay(40), handle, draw, Animated.parallel([reveal, fly]), out(1500, 400)]); // everything holds 1.5 s
      current.start(finish);
    })();
    return () => { finished = true; current?.stop(); };
  }, [v, onDone, ready]);
  const skip = () => Animated.timing(v.fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(onDone);
  const { parts } = ROUTE;
  // Side panels swing open on their fold lines, from edge-on to flat.
  const flap = (value: Animated.Value, side: "left" | "right") => ({ ...box(parts[side]), transformOrigin: side === "left" ? "right" : "left", opacity: value.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1] }), transform: [{ perspective: 500 }, { rotateY: value.interpolate({ inputRange: [0, 1], outputRange: [side === "left" ? "-90deg" : "90deg", "0deg"] }) }] });
  // The body gives a little as the handle lands on it.
  const squash = v.handle.interpolate({ inputRange: [0, 0.75, 0.9, 1], outputRange: [1, 1, 0.97, 1] });
  const markX = v.shift.interpolate({ inputRange: [0, 1], outputRange: [0, -(WORD_W + GAP) / 2] });
  const lift = v.shift.interpolate({ inputRange: [0, 1], outputRange: [0, -LIFT] });
  // Flight, in tagline-row coordinates. The text's final left edge is L0; until RELEASE the plane
  // flies TOW px ahead of the text's end, then it climbs away to the top right.
  const L0 = (LOCK_W - textW) / 2;
  const START = -((Dimensions.get("window").width - LOCK_W) / 2 + L0 + textW + TOW + 30);
  const textAt = (u: number) => START * (1 - easeOut(Math.min(u / RELEASE, 1)));
  const textX = v.fly.interpolate({ inputRange: SAMPLES, outputRange: SAMPLES.map(textAt), extrapolate: "clamp" });
  const nose = L0 + textW + TOW;
  const planeX = v.fly.interpolate({ inputRange: [...SAMPLES, 0.72, 1], outputRange: [...SAMPLES.map(u => textAt(u) + nose), nose + 45, nose + 210] });
  const planeY = v.fly.interpolate({ inputRange: [0, 0.2, RELEASE, 0.72, 1], outputRange: [LINE_H / 2 - 30, LINE_H / 2, LINE_H / 2, LINE_H / 2 - 10, -300] });
  const planeR = v.fly.interpolate({ inputRange: [0, 0.2, RELEASE, 0.72, 1], outputRange: ["10deg", "0deg", "0deg", "-14deg", "-50deg"] });
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: BG, opacity: v.fade, zIndex: 100, elevation: 100 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Tripanize. Tap to skip the intro" onPress={skip} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ width: MARK_W, height: MARK_H, transform: [{ translateY: lift }] }}>
        <Animated.View style={{ width: MARK_W, height: MARK_H, transform: [{ translateX: markX }] }}>
          <Animated.View style={{ width: MARK_W, height: MARK_H, transformOrigin: "bottom", transform: [{ scaleY: squash }] }}>
            <Image source={PART_IMAGES.middle} style={box(parts.middle)} contentFit="fill" onDisplay={() => setReady(true)} />
            <Animated.View style={flap(v.left, "left")}><Image source={PART_IMAGES.left} style={{ width: "100%", height: "100%" }} contentFit="fill" /></Animated.View>
            <Animated.View style={flap(v.right, "right")}><Image source={PART_IMAGES.right} style={{ width: "100%", height: "100%" }} contentFit="fill" /></Animated.View>
            {ROUTE.pieces.map((p, i) => <Animated.View key={i} style={{ ...box(p), opacity: v.pieces[i], transform: [{ scale: v.pieces[i].interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }}>
              <Image source={PIECES[i]} style={{ width: "100%", height: "100%" }} contentFit="fill" />
            </Animated.View>)}
          </Animated.View>
          <Animated.View style={{ ...box(parts.handle), opacity: v.handle.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: [{ translateY: v.handle.interpolate({ inputRange: [0, 1], outputRange: [-26, 0] }) }] }}>
            <Image source={PART_IMAGES.handle} style={{ width: "100%", height: "100%" }} contentFit="fill" />
          </Animated.View>
        </Animated.View>
        <Animated.View style={{ position: "absolute", left: MARK_W + GAP - (WORD_W + GAP) / 2, top: WORD_TOP, opacity: v.word, transform: [{ translateX: v.word.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}>
          <Image source={require("../../assets/wordmark.png")} tintColor={INK} style={{ width: WORD_W, height: WORD_H }} contentFit="contain" />
        </Animated.View>
        <View style={{ position: "absolute", left: (MARK_W - LOCK_W) / 2, top: MARK_H + LINE_GAP, width: LOCK_W, height: LINE_H }}>
          <Animated.View style={{ position: "absolute", left: L0, top: 0, height: LINE_H, flexDirection: "row", alignItems: "center", opacity: v.fly.interpolate({ inputRange: [0, 0.02], outputRange: [0, 1], extrapolate: "clamp" }), transform: [{ translateX: textX }] }}>
            <Text onLayout={e => setTextW(Math.ceil(e.nativeEvent.layout.width))} numberOfLines={1} style={{ fontFamily: "NunitoBold", fontSize: 20, lineHeight: LINE_H, color: INK, letterSpacing: 0.2 }}>{TAGLINE}</Text>
            {/* The tow line, dropped as the plane lets go. */}
            <Animated.View style={{ position: "absolute", left: textW + 4, top: LINE_H / 2 - 0.75, width: TOW - 17, height: 1.5, backgroundColor: CORAL, opacity: v.fly.interpolate({ inputRange: [0, RELEASE - 0.05, RELEASE + 0.03], outputRange: [0.7, 0.7, 0], extrapolate: "clamp" }) }} />
          </Animated.View>
          <Animated.View style={{ position: "absolute", left: -15, top: -15, width: 30, height: 30, alignItems: "center", justifyContent: "center", opacity: v.fly.interpolate({ inputRange: [0, 0.02, 0.93, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateX: planeX }, { translateY: planeY }, { rotate: planeR }] }}>
            <Ionicons name="airplane" size={27} color={CORAL} />
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  </Animated.View>;
}

