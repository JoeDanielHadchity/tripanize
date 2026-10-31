import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { authClient, photo } from "../lib/auth";
import { useApi, tripDates } from "../lib/data";
import { usePublicData, type MobilePublicHome } from "../lib/public-data";
import { workspaceHref } from "../lib/workspace";
import type { MobileTripCard } from "../lib/types";
import { HOME_SCENES } from "../../../src/lib/home-content";
import { FEATURE_PAGES } from "../../../src/lib/feature-pages";
import { Avatar, Badge, Brand, Button, Card, ErrorNotice, Eyebrow, Heading, Icon, Loading, Muted, OnPhoto, PhotoCard, Screen, T, styles, type IconName } from "./ui";
import { useTheme } from "./theme";
import { CreateTripButton, NativeLegalLinks } from "./public-header";

const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
export function countdown(start: string | null, end: string | null) {
  if (!start) return null;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const days = Math.round((Date.parse(`${start}T12:00:00`) - today.getTime()) / 86_400_000);
  const last = end ? Math.round((Date.parse(`${end}T12:00:00`) - today.getTime()) / 86_400_000) : days;
  if (days <= 0 && last >= 0) return "Happening now";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  return null;
}
const openTrip = (trip: MobileTripCard) => router.push(workspaceHref({ screen: trip.onboardingStage === "COMPLETE" ? "itinerary" : "setup", tripId: trip.id }));

function QuickAction({ icon, label, onPress, tint }: { icon: IconName; label: string; onPress: () => void; tint?: string }) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 8, opacity: pressed ? 0.7 : 1 })}>
    <View style={{ width: 58, height: 58, borderRadius: 20, backgroundColor: tint ?? c.soft, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={25} color={tint ? "#fff" : c.accent} /></View>
    <T style={{ fontSize: 12, lineHeight: 16, textAlign: "center", fontFamily: "InterSemibold" }}>{label}</T>
  </Pressable>;
}

function NextTrip() {
  const c = useTheme(); const { data, error, reload } = useApi<{ trips: MobileTripCard[] }>("/api/mobile/trips");
  if (error) return <ErrorNotice message={error} retry={reload} />;
  if (!data) return <Loading />;
  const upcoming = data.trips.filter(t => t.phase === "current" || t.phase === "upcoming").sort((a, b) => (a.startDate ?? "9").localeCompare(b.startDate ?? "9"));
  const next = upcoming[0] ?? data.trips.find(t => t.phase === "undated");
  if (!next) return <Card style={{ backgroundColor: c.soft, alignItems: "center", paddingVertical: 28 }}><Icon name="airplane" size={30} /><Heading small>Where to next?</Heading><Muted style={{ textAlign: "center" }}>Create your first trip and get a day-by-day plan in minutes.</Muted><CreateTripButton /></Card>;
  const when = countdown(next.startDate, next.endDate);
  return <View style={{ gap: 10 }}>
    <View style={[styles.row, { paddingHorizontal: 4 }]}><T style={{ fontFamily: "InterSemibold", fontSize: 17 }}>{next.phase === "current" ? "On your trip" : "Your next trip"}</T>{data.trips.length > 1 && <Pressable accessibilityRole="button" onPress={() => router.navigate("/trips")} style={{ minHeight: 40, justifyContent: "center" }}><T style={{ color: c.accent, fontFamily: "InterSemibold", fontSize: 13 }}>All trips</T></Pressable>}</View>
    <PhotoCard source={next.image?.url} height={280} label={`Open ${next.name}`} onPress={() => openTrip(next)} top={<>{when ? <Badge onImage icon="time-outline">{when}</Badge> : <View />}{next.premium && <Badge onImage icon="sparkles">Premium</Badge>}</>}>
      <OnPhoto size="small">{next.destinations.join(" · ") || "Your trip"}</OnPhoto>
      <OnPhoto size="title">{next.name}</OnPhoto>
      <View style={[styles.row, { marginTop: 4 }]}><OnPhoto>{tripDates(next.startDate, next.endDate)} · {next.travelers.length || 1} {next.travelers.length === 1 ? "traveler" : "travelers"}</OnPhoto><View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" }}><Icon name="arrow-forward" size={18} color="#172e33" /></View></View>
    </PhotoCard>
  </View>;
}

function Ideas() {
  const c = useTheme(); const { data, error, retry } = usePublicData<MobilePublicHome>();
  return <View style={{ gap: 10 }}>
    <View style={{ paddingHorizontal: 4, gap: 2 }}><T style={{ fontFamily: "InterSemibold", fontSize: 17 }}>Trip ideas</T><Muted>4-day itineraries to make your own</Muted></View>
    {error ? <ErrorNotice message={error} retry={retry} /> : !data ? <Loading /> : <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={232} decelerationRate="fast" style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingVertical: 4 }}>
      {data.guides.map(guide => <PhotoCard key={guide.slug} source={photo(guide.image)} height={290} radius={22} style={{ width: 220 }} label={`${guide.city}, ${guide.dayCount}-day example itinerary`} onPress={() => router.push({ pathname: "/guide/[slug]", params: { slug: guide.slug } })} top={<Badge onImage>{`${guide.dayCount} days`}</Badge>}>
        <OnPhoto size="small">{guide.country}</OnPhoto><OnPhoto size="title" style={{ fontSize: 23, lineHeight: 28 }}>{guide.city}</OnPhoto>
      </PhotoCard>)}
    </ScrollView>}
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{[...FEATURE_PAGES.map(f => ({ label: f.label, go: () => router.push({ pathname: "/feature/[slug]", params: { slug: f.href.slice(1) } }) })), { label: "Plans & pricing", go: () => router.push("/plans") }].map(link => <Pressable key={link.label} accessibilityRole="link" onPress={link.go} style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: c.paper, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.7 : 1 })}><T style={{ fontSize: 13, fontFamily: "InterSemibold", color: c.accent }}>{link.label}</T></Pressable>)}</View>
  </View>;
}

function HowItWorks() {
  const c = useTheme(); const { width } = useWindowDimensions(); const card = Math.min(300, width - 72);
  return <View style={{ gap: 10 }}>
    <T style={{ fontFamily: "InterSemibold", fontSize: 17, paddingHorizontal: 4 }}>How it works</T>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={card + 12} decelerationRate="fast" style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingVertical: 4 }}>
      {HOME_SCENES.map((step, i) => <Card key={step.label} style={{ width: card, gap: 10 }}>
        <View style={styles.row}><View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}><T style={{ color: c.accentText, fontFamily: "InterSemibold" }}>{i + 1}</T></View><Eyebrow>{step.label}</Eyebrow></View>
        <Heading small>{step.title}</Heading><Muted>{step.copy}</Muted>
        <View style={{ backgroundColor: c.bg, borderRadius: 14, padding: 12, gap: 8 }}><T style={{ fontSize: 11, color: c.muted, fontFamily: "InterSemibold", letterSpacing: 1, textTransform: "uppercase" }}>{step.note}</T>{step.rows.map(([label, value]) => <View key={label} style={styles.row}><T style={{ color: c.muted, fontSize: 12 }}>{label}</T><T style={{ fontSize: 13, textAlign: "right", flexShrink: 1 }}>{value}</T></View>)}</View>
      </Card>)}
    </ScrollView>
  </View>;
}

function PremiumPromo() {
  const c = useTheme();
  return <Card style={{ backgroundColor: c.accent, gap: 8 }} onPress={() => router.push("/plans")} accessibilityLabel="Compare plans">
    <View style={styles.row}><Eyebrow color={c.dark ? c.accentText : "#f6e3da"}>One trip · everyone included</Eyebrow><Icon name="sparkles" color={c.accentText} size={20} /></View>
    <T style={{ fontFamily: "Fraunces", fontSize: 24, lineHeight: 30, color: c.accentText }}>Start free. Upgrade a trip for $15.</T>
    <T style={{ color: c.accentText, opacity: 0.85, fontSize: 14 }}>Every day planned, group chat, shared expenses and events nearby. One payment, no subscription.</T>
  </Card>;
}

export function NativeHome() {
  const c = useTheme(); const { data: session } = authClient.useSession();
  if (session) return <Screen>
    <View style={[styles.row, { paddingTop: 4 }]}><View style={{ flex: 1, gap: 2 }}><Muted>{greeting()}</Muted><Heading>{session.user.name?.split(" ")[0] || "Traveler"}</Heading></View><Pressable accessibilityRole="button" accessibilityLabel="Your account" onPress={() => router.navigate("/account")}><Avatar name={session.user.name || session.user.email} size={46} /></Pressable></View>
    <NextTrip />
    <View style={{ flexDirection: "row", gap: 8 }}>
      <QuickAction icon="add" label="New trip" tint={c.coral} onPress={() => router.push("/start")} />
      <QuickAction icon="compass-outline" label="Find a place" onPress={() => router.push("/destinations")} />
      <QuickAction icon="mail-open-outline" label="Invitations" onPress={() => router.push(workspaceHref({ screen: "trips" }))} />
      <QuickAction icon="cloud-offline-outline" label="Offline" onPress={() => router.push("/offline")} />
    </View>
    <Ideas />
    <PremiumPromo />
    <HowItWorks />
    <NativeLegalLinks />
  </Screen>;
  return <Screen style={{ paddingTop: 0 }}>
    <View style={[styles.row, { paddingTop: 8 }]}><Brand /><Button compact secondary onPress={() => router.push("/sign-in")}>Sign in</Button></View>
    <PhotoCard source={photo("/editorial/home.webp")} height={460} radius={28} scrim={0.88} label="Porto waterfront on the Douro River">
      <Eyebrow color="#f6e3da">Your trip organizer</Eyebrow>
      <T style={{ fontFamily: "Fraunces", fontSize: 40, lineHeight: 44, color: "#fff", letterSpacing: -1 }}>Plan less.{"\n"}Travel more.</T>
      <OnPhoto>Your itinerary, bookings and group in one place.</OnPhoto>
      <View style={{ marginTop: 12, gap: 10 }}><CreateTripButton label="Plan a trip — it's free" /><Button secondary onPress={() => router.push({ pathname: "/guide/[slug]", params: { slug: "lisbon-porto" } })} trailingIcon="arrow-forward">See an example trip</Button></View>
    </PhotoCard>
    <HowItWorks />
    <Ideas />
    <PremiumPromo />
    <View style={{ alignItems: "center", gap: 6, paddingTop: 8 }}><Brand /><Muted>Plan less. Travel more.</Muted></View>
    <NativeLegalLinks />
  </Screen>;
}

