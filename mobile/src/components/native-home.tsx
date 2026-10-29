import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { photo } from "../lib/auth";
import { usePublicData, type MobilePublicHome } from "../lib/public-data";
import { HOME_SCENES } from "../../../src/lib/home-content";
import { Brand, Button, Card, ErrorNotice, Eyebrow, Heading, Icon, Loading, Muted, Screen, T, styles } from "./ui";
import { useTheme } from "./theme";
import { CreateTripButton, NativeLegalLinks, NativePublicHeader } from "./public-header";

function NativeExplainer() {
  const c = useTheme(); const [scene, setScene] = useState(0);
  const reduced = useRef(true), screenReader = useRef(true), touched = useRef(false);
  useEffect(() => {
    let current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (current) reduced.current = value; }).catch(() => {});
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (current) screenReader.current = value; }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", value => { reduced.current = value; });
    const reader = AccessibilityInfo.addEventListener("screenReaderChanged", value => { screenReader.current = value; });
    return () => { current = false; motion.remove(); reader.remove(); };
  }, []);
  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && !reduced.current && !screenReader.current && !touched.current) setScene(s => (s + 1) % HOME_SCENES.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []));
  const step = HOME_SCENES[scene];
  return <View style={{ gap: 16 }}><Heading small>How it works</Heading>
    <View accessibilityRole="tablist" style={{ flexDirection: "row", justifyContent: "space-between", gap: 4 }}>{HOME_SCENES.map((s, i) => <Pressable key={s.label} accessibilityRole="tab" accessibilityLabel={`Step ${i + 1}: ${s.title}`} accessibilityState={{ selected: i === scene }} onFocus={() => { touched.current = true; }} onPress={() => { touched.current = true; setScene(i); }} style={{ alignItems: "center", gap: 7, flex: 1, paddingVertical: 8 }}><View style={{ width: 35, height: 35, borderRadius: 18, backgroundColor: i === scene ? c.accent : c.soft, alignItems: "center", justifyContent: "center" }}><T style={{ color: i === scene ? c.accentText : c.ink, fontFamily: "InterSemibold" }}>{i + 1}</T></View><T style={{ fontSize: 11, color: c.muted }}>{s.label}</T></Pressable>)}</View>
    <Card><Eyebrow>{step.note}</Eyebrow><Heading small>{step.title}</Heading><Muted>{step.copy}</Muted>
      <View style={{ paddingTop: 10, gap: 12 }}>{step.rows.map(([label, value]) => <View key={label} style={styles.row}><T style={{ color: c.muted, fontSize: 12, flex: 1 }}>{label}</T><T style={{ fontSize: 13, textAlign: "right", flex: 2 }}>{value}</T></View>)}</View>
    </Card>
    <Muted>Free: 2 AI-planned days. Premium: $15 per trip, all travelers.</Muted>
  </View>;
}

export function NativeHome() {
  const c = useTheme(); const { data, error, retry } = usePublicData<MobilePublicHome>();
  return <Screen style={{ gap: 30 }}><NativePublicHeader />
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <Image source={photo("/editorial/home.webp")} accessibilityLabel="Porto waterfront on the Douro River" style={{ width: "100%", height: 245 }} contentFit="cover" />
      <View style={{ padding: 23, gap: 16 }}><Eyebrow>A little more going</Eyebrow>
        <Heading>Plan less.{"\n"}<T style={{ fontFamily: "Fraunces", fontSize: 36, lineHeight: 43, color: c.accent }}>Travel more.</T></Heading>
        <Muted>Your trip planner, bookings and group in one place.</Muted>
        <CreateTripButton /><Button secondary onPress={() => router.push({ pathname: "/guide/[slug]", params: { slug: "lisbon-porto" } })}>View example trip</Button>
        <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: c.line, paddingTop: 16, gap: 8 }}><View style={styles.row}><T style={{ fontFamily: "Fraunces", fontSize: 25 }}>LIS → OPO</T><Icon name="airplane-outline" /></View><Muted>Porto · 4 days · 3 travelers · Example trip</Muted></View>
      </View>
    </Card>
    <NativeExplainer />
    <View style={{ gap: 16 }}><Heading small>Explore trip ideas.</Heading><Muted>4-day itineraries to make your own</Muted>
      {error ? <ErrorNotice message={error} retry={retry} /> : !data ? <Loading /> : data.guides.map(guide => <Pressable key={guide.slug} accessibilityRole="button" accessibilityLabel={`${guide.city}, ${guide.dayCount}-day example itinerary`} onPress={() => router.push({ pathname: "/guide/[slug]", params: { slug: guide.slug } })} style={({ pressed }) => ({ borderWidth: 1, borderColor: c.line, borderRadius: 20, overflow: "hidden", backgroundColor: c.paper, opacity: pressed ? 0.8 : 1 })}>
        <Image source={photo(guide.image)} accessibilityLabel={guide.alt} style={{ width: "100%", aspectRatio: 1.6 }} contentFit="cover" />
        <View style={{ padding: 20, gap: 7 }}><Muted>{guide.country}</Muted><View style={styles.row}><Heading small>{guide.city}</Heading><Icon name="arrow-up-outline" /></View><T style={{ fontSize: 13, color: c.accent }}>{guide.dayCount} days · View itinerary ↗</T></View>
      </Pressable>)}
    </View>
    <View style={{ gap: 16 }}><Heading small>Your trip, together.</Heading>{[
      ["01", "Plan each day", "Edit your itinerary, one day at a time."],
      ["02", "Events & bookings", "Event suggestions linked to bookings."],
      ["03", "Travel together", "Share plans, chat and split expenses."],
    ].map(([number, title, text]) => <Card key={number}><Eyebrow>{number}</Eyebrow><Heading small>{title}</Heading><Muted>{text}</Muted></Card>)}</View>
    <Card style={{ backgroundColor: c.soft }}><Eyebrow>One trip. Everyone included.</Eyebrow><Heading small>Start free.{"\n"}Upgrade for $15.</Heading><Muted>One payment. All travelers.</Muted><Button onPress={() => router.push("/plans")}>Compare plans →</Button></Card>
    <View style={{ alignItems: "center", gap: 8, paddingVertical: 14 }}><Brand /><Muted>Your trip organizer.</Muted></View><NativeLegalLinks />
  </Screen>;
}
