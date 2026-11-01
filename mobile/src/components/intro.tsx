import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from "react-native";
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
const WORD_W = 118, WORD_H = WORD_W * 166 / 660, GAP = 12;
const KEY = "tripanize-intro-day";
const box = (b: Box) => ({ position: "absolute" as const, left: b.x * SCALE, top: b.y * SCALE, width: b.w * SCALE, height: b.h * SCALE });
const timing = (value: Animated.Value, duration: number, easing: (t: number) => number, delay = 0) => Animated.timing(value, { toValue: 1, duration, delay, easing, useNativeDriver: true });

// Route centres, for the traveller that runs along it in the "slide" version.
const STOPS = ROUTE.pieces.map(p => ({ x: (p.x + p.w / 2) * SCALE, y: (p.y + p.h / 2) * SCALE }));
const LAST = STOPS.length - 1, CORAL = "#d0643f", TRAVELLER = 7;

/** Which opening plays. "unfold": the side panels swing open on their folds, the
 * handle drops on, the route draws dot by dot. "slide": the side panels slide out
 * from behind the middle, the handle pops up from behind, and a coral traveller
 * runs the route, laying the dots as it goes. */
export type IntroVariant = "unfold" | "slide";
export const INTRO_VARIANT: IntroVariant = "unfold";

/** Opening animation (about 4 s): the folded map opens, becomes the suitcase,
 * then the trip route launches and the wordmark slides in. Quicker after the
 * first open each day, none with reduced motion. Tap to skip. */
export function Intro({ onDone, variant = INTRO_VARIANT }: { onDone: () => void; variant?: IntroVariant }) {
  const slide = variant === "slide";
  const [v] = useState(() => ({ left: new Animated.Value(0), right: new Animated.Value(0), handle: new Animated.Value(0), word: new Animated.Value(0), shift: new Animated.Value(0), fade: new Animated.Value(1), trip: new Animated.Value(0), ring: new Animated.Value(0), pieces: ROUTE.pieces.map(() => new Animated.Value(0)) }));
  // Wait until the folded map has actually been drawn before dropping the launch screen and starting.
  const [ready, setReady] = useState(false);
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
        [v.left, v.right, v.handle, v.trip, ...v.pieces].forEach(p => p.setValue(1));
        current = Animated.timing(v.fade, { toValue: 0, duration: 250, delay: 250, useNativeDriver: true }); current.start(finish); return;
      }
      const s = quick ? 0.35 : 1; // the quick version runs the same story at about a third of the time
      const unfold = slide
        ? Animated.parallel([timing(v.left, 560 * s, Easing.out(Easing.back(1.5))), timing(v.right, 560 * s, Easing.out(Easing.back(1.5)))])
        : Animated.parallel([timing(v.left, 650 * s, Easing.out(Easing.back(1.2))), timing(v.right, 650 * s, Easing.out(Easing.back(1.2)), 130 * s)]);
      const handle = timing(v.handle, 480 * s, Easing.out(Easing.back(2.2)));
      const draw = slide
        ? Animated.timing(v.trip, { toValue: LAST, duration: 1700 * s, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
        : Animated.stagger(70 * s, v.pieces.map((p, i) => timing(p, 360 * s, Easing.out(Easing.back(ROUTE.pieces[i].dot ? 3 : 1.6)))));
      const reveal = Animated.parallel([timing(v.shift, 600, Easing.inOut(Easing.cubic)), timing(v.word, 560, Easing.out(Easing.cubic), 160), ...(slide ? [timing(v.ring, 700, Easing.out(Easing.quad))] : [])]);
      const out = (delay: number, duration: number) => Animated.timing(v.fade, { toValue: 0, duration, delay, useNativeDriver: true });
      current = Animated.sequence(quick
        ? [unfold, handle, draw, out(150, 250)]
        : [Animated.delay(200), unfold, Animated.delay(40), handle, draw, reveal, out(500, 350)]);
      current.start(finish);
    })();
    return () => { finished = true; current?.stop(); };
  }, [v, onDone, ready, slide]);
  const skip = () => Animated.timing(v.fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(onDone);
  const { parts } = ROUTE;
  // Side panels swing open on their fold lines, from edge-on to flat.
  const flap = (value: Animated.Value, side: "left" | "right") => ({ ...box(parts[side]), transformOrigin: side === "left" ? "right" : "left", opacity: value.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1] }), transform: [{ perspective: 500 }, { rotateY: value.interpolate({ inputRange: [0, 1], outputRange: [side === "left" ? "-90deg" : "90deg", "0deg"] }) }] });
  // "slide": each panel starts tucked behind the middle one and slides out to its place.
  const tucked = (value: Animated.Value, side: "left" | "right") => {
    const dx = ((parts.middle.x + parts.middle.w / 2) - (parts[side].x + parts[side].w / 2)) * SCALE;
    return { ...box(parts[side]), opacity: value.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }), transform: [{ translateX: value.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) }, { scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] };
  };
  const panel = slide ? tucked : flap;
  // Route pieces: popped in one by one, or laid by the traveller as it passes.
  const piece = (i: number) => {
    if (!slide) return { opacity: v.pieces[i], transform: [{ scale: v.pieces[i].interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] };
    const at = Math.max(0.06, i - 0.35);
    return { opacity: v.trip.interpolate({ inputRange: [at - 0.01, at], outputRange: [0, 1], extrapolate: "clamp" as const }), transform: [{ scale: v.trip.interpolate({ inputRange: [at - 0.01, at, at + 0.35, at + 0.8], outputRange: [0.2, 0.4, ROUTE.pieces[i].dot ? 1.35 : 1.15, 1], extrapolate: "clamp" as const }) }] };
  };
  const along = (axis: "x" | "y") => v.trip.interpolate({ inputRange: STOPS.map((_, i) => i), outputRange: STOPS.map(p => p[axis] - TRAVELLER / 2) });
  // The body gives a little as the handle lands on it.
  const squash = v.handle.interpolate({ inputRange: [0, 0.75, 0.9, 1], outputRange: [1, 1, 0.97, 1] });
  const handleView = <Animated.View style={{ ...box(parts.handle), opacity: v.handle.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: [{ translateY: v.handle.interpolate({ inputRange: [0, 1], outputRange: [slide ? 24 : -26, 0] }) }] }}>
    <Image source={PART_IMAGES.handle} style={{ width: "100%", height: "100%" }} contentFit="fill" />
  </Animated.View>;
  const markX = v.shift.interpolate({ inputRange: [0, 1], outputRange: [0, -(WORD_W + GAP) / 2] });
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: BG, opacity: v.fade, zIndex: 100, elevation: 100 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Tripanize. Tap to skip the intro" onPress={skip} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: MARK_W, height: MARK_H }}>
        <Animated.View style={{ width: MARK_W, height: MARK_H, transform: [{ translateX: markX }] }}>
          {/* "slide": the handle pops up from behind the body, so it sits underneath it. */}
          {slide && handleView}
          <Animated.View style={{ width: MARK_W, height: MARK_H, transformOrigin: "bottom", transform: [{ scaleY: squash }] }}>
            <Animated.View style={panel(v.left, "left")}><Image source={PART_IMAGES.left} style={{ width: "100%", height: "100%" }} contentFit="fill" /></Animated.View>
            <Animated.View style={panel(v.right, "right")}><Image source={PART_IMAGES.right} style={{ width: "100%", height: "100%" }} contentFit="fill" /></Animated.View>
            <Image source={PART_IMAGES.middle} style={box(parts.middle)} contentFit="fill" onDisplay={() => setReady(true)} />
            {ROUTE.pieces.map((p, i) => <Animated.View key={i} style={{ ...box(p), ...piece(i) }}>
              <Image source={PIECES[i]} style={{ width: "100%", height: "100%" }} contentFit="fill" />
            </Animated.View>)}
            {slide && <>
              <Animated.View pointerEvents="none" style={{ position: "absolute", left: STOPS[LAST].x - 9, top: STOPS[LAST].y - 9, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: CORAL, opacity: v.ring.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.9, 0] }), transform: [{ scale: v.ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] }) }] }} />
              <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: TRAVELLER, height: TRAVELLER, borderRadius: TRAVELLER / 2, backgroundColor: CORAL, boxShadow: "0 0 0 2px #f6f2e9", opacity: v.trip.interpolate({ inputRange: [0, 0.05, LAST - 0.15, LAST], outputRange: [0, 1, 1, 0] }), transform: [{ translateX: along("x") }, { translateY: along("y") }] }} />
            </>}
          </Animated.View>
          {!slide && handleView}
        </Animated.View>
        <Animated.View style={{ position: "absolute", left: MARK_W + GAP - (WORD_W + GAP) / 2, top: (MARK_H - WORD_H) / 2, opacity: v.word, transform: [{ translateX: v.word.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}>
          <Image source={require("../../assets/wordmark.png")} tintColor={INK} style={{ width: WORD_W, height: WORD_H }} contentFit="contain" />
        </Animated.View>
      </View>
    </Pressable>
  </Animated.View>;
}
