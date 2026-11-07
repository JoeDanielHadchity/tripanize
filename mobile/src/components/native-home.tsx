import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { authClient, photo } from "../lib/auth";
import { useApi, tripDates } from "../lib/data";
import { usePublicData, type MobilePublicHome } from "../lib/public-data";
import { lastPlace } from "../lib/last-place";
import { workspaceHref } from "../lib/workspace";
import type { MobileTripCard } from "../lib/types";
import { HOME_SCENES } from "../../../src/lib/home-content";
import { FEATURE_PAGES } from "../../../src/lib/feature-pages";
import { Badge, Brand, Button, Card, ErrorNotice, Eyebrow, Heading, Icon, Loading, Muted, OnPhoto, PhotoCard, Screen, T, styles, type IconName } from "./ui";
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
const openTrip = (trip: MobileTripCard) => router.push(workspaceHref({ screen: trip.onboardingStage === "COMPLETE" ? lastPlace(trip.id) : "setup", tripId: trip.id }));

function QuickAction({ icon, label, onPress, tint }: { icon: IconName; label: string; onPress: () => void; tint?: string }) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 8, opacity: pressed ? 0.7 : 1 })}>
    <View style={{ width: 58, height: 58, borderRadius: 20, backgroundColor: tint ?? c.soft, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={25} color={tint ? "#fff" : c.accent} /></View>
    <T style={{ fontSize: 12, lineHeight: 16, textAlign: "center", fontFamily: "NunitoBold" }}>{label}</T>
  </Pressable>;
}

function NextTrip() {
  const c = useTheme(); const { data, error, reload } = useApi<{ trips: MobileTripCard[] }>("/api/mobile/trips");
  if (error) return <ErrorNotice message={error} retry={reload} />;
  if (!data) return <Loading />;
  const upcoming = data.trips.filter(t => t.phase === "current" || t.phase === "upcoming").sort((a, b) => (a.startDate ?? "9").localeCompare(b.startDate ?? "9"));
  const next = upcoming[0] ?? data.trips.find(t => t.phase === "undated");
  if (!next) return <Card style={{ backgroundColor: c.soft, alignItems: "center", paddingVertical: 28 }}><Icon name="airplane" size={30} /><Heading small>Where to next?</Heading><Muted style={{ textAlign: "center" }}>Create your first trip and get a day-by-day plan in minutes.</Muted><CreateTripButton /></Card>;
  return <TripTicket trip={next} more={data.trips.length > 1} />;
}

const daysUntil = (date: string) => { const today = new Date(); today.setHours(12, 0, 0, 0); return Math.round((Date.parse(`${date}T12:00:00`) - today.getTime()) / 86_400_000); };

/** Design 004: a big countdown, then the trip as a dark boarding pass. */
function TripTicket({ trip, more }: { trip: MobileTripCard; more: boolean }) {
  const c = useTheme();
  const days = trip.startDate ? daysUntil(trip.startDate) : null;
  const place = (trip.destinations[0] ?? trip.name).split(",")[0].trim();
  const route = trip.destinations.map(d => d.split(",")[0].trim()).filter(Boolean);
  const length = trip.startDate && trip.endDate ? daysUntil(trip.endDate) - daysUntil(trip.startDate) + 1 : null;
  const crew = trip.travelers.length || 1;
  const label = (text: string) => <T style={{ fontSize: 11, lineHeight: 14, letterSpacing: 1.3, fontFamily: "NunitoBold", color: c.nightMuted }}>{text.toUpperCase()}</T>;
  return <View style={{ gap: 12 }}>
    {days !== null && days > 0 ? <View accessible accessibilityLabel={`${days} ${days === 1 ? "day" : "days"} to ${place}`} style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, paddingHorizontal: 2 }}>
      <T style={{ fontFamily: "NunitoHeading", fontSize: 108, lineHeight: 104, letterSpacing: -5, color: c.accent }}>{days}</T>
      <T style={{ fontFamily: "NunitoHeading", fontSize: 28, lineHeight: 30, paddingBottom: 10, flexShrink: 1 }}>{days === 1 ? "day to" : "days to"}{"\n"}{place}</T>
    </View> : <View style={[styles.row, { paddingHorizontal: 4 }]}><T style={{ fontFamily: "NunitoHeading", fontSize: 24, lineHeight: 30 }}>{trip.phase === "current" ? `On your trip in ${place}` : "Your next trip"}</T></View>}
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${trip.name}`} onPress={() => openTrip(trip)} style={({ pressed }) => ({ borderRadius: 28, backgroundColor: c.night, overflow: "hidden", transform: [{ scale: pressed ? 0.99 : 1 }], boxShadow: "0 12px 26px rgba(23,46,51,0.22)" })}>
      {trip.image?.url ? <Image source={{ uri: trip.image.url }} style={{ height: 150 }} contentFit="cover" accessible={false} /> : <View style={{ height: 70, backgroundColor: c.nightLine }} />}
      {trip.premium && <View style={{ position: "absolute", left: 14, top: 14, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: c.nightInk }}><T style={{ fontSize: 11, lineHeight: 14, letterSpacing: 1, fontFamily: "NunitoBold", color: "#0b6e74" }}>PREMIUM</T></View>}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 4 }}>
        <T style={{ fontFamily: "NunitoHeading", fontSize: 24, lineHeight: 28, color: c.nightInk }}>{trip.name}</T>
        {route.length > 0 && <T style={{ fontFamily: "NunitoBold", fontSize: 14, lineHeight: 19, color: c.nightAccent }}>{route.join(" → ")}</T>}
      </View>
      <View style={{ height: 22, justifyContent: "center", marginTop: 6 }}>
        <View style={{ position: "absolute", left: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: c.bg }} />
        <View style={{ marginHorizontal: 20, borderTopWidth: 2, borderStyle: "dashed", borderColor: c.nightLine }} />
        <View style={{ position: "absolute", right: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: c.bg }} />
      </View>
      <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingBottom: 18, paddingTop: 2, gap: 8 }}>
        <View style={{ flex: 1.4, gap: 2 }}>{label("Dates")}<T style={{ fontFamily: "NunitoBold", fontSize: 14, lineHeight: 19, color: c.nightInk }}>{tripDates(trip.startDate, trip.endDate) || "Not set"}</T></View>
        <View style={{ flex: 0.7, gap: 2 }}>{label("Days")}<T style={{ fontFamily: "NunitoBold", fontSize: 14, lineHeight: 19, color: c.nightInk }}>{length ?? "—"}</T></View>
        <View style={{ flex: 1, gap: 2 }}>{label("Crew")}<T style={{ fontFamily: "NunitoBold", fontSize: 14, lineHeight: 19, color: c.nightInk }}>{crew} {crew === 1 ? "person" : "people"}</T></View>
      </View>
    </Pressable>
    {more && <Pressable accessibilityRole="button" onPress={() => router.navigate("/trips")} style={{ alignSelf: "flex-end", minHeight: 40, justifyContent: "center", paddingHorizontal: 4 }}><T style={{ color: c.accent, fontFamily: "NunitoBold", fontSize: 14 }}>All trips</T></Pressable>}
  </View>;
}

const FEATURE_ICONS: Record<string, IconName> = { "/ai-trip-planner": "map-outline", "/group-trip-planner": "people-outline", "/travel-expense-splitter": "receipt-outline" };
const FEATURE_SHORT: Record<string, string> = { "/ai-trip-planner": "Trip planner", "/group-trip-planner": "Group travel", "/travel-expense-splitter": "Expense splitter" };

/** What Tripanize does: the three feature pages as icon tiles, and a slim pricing banner. */
function Explore() {
  const c = useTheme();
  return <View style={{ gap: 10 }}>
    <View style={{ paddingHorizontal: 4, gap: 2 }}><T style={{ fontFamily: "NunitoBold", fontSize: 17 }}>Explore Tripanize</T><Muted>Everything your trip needs</Muted></View>
    <View style={{ flexDirection: "row", gap: 8 }}>
      {FEATURE_PAGES.map(f => <QuickAction key={f.href} icon={FEATURE_ICONS[f.href] ?? "sparkles-outline"} label={FEATURE_SHORT[f.href] ?? f.label} onPress={() => router.push({ pathname: "/feature/[slug]", params: { slug: f.href.slice(1) } })} />)}
    </View>
    <Pressable accessibilityRole="link" accessibilityLabel="Plans and pricing. Start free, Premium is $15 a trip" onPress={() => router.push("/plans")} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16, borderRadius: 18, backgroundColor: c.paper, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.7 : 1 })}>
      <Icon name="sparkles" size={20} color={c.accent} />
      <T style={{ flex: 1, fontSize: 14, lineHeight: 19 }}>Start free · Premium is $15 a trip</T>
      <T style={{ fontSize: 14, fontFamily: "NunitoBold", color: c.accent }}>Plans</T>
    </Pressable>
  </View>;
}

function Ideas() {
  const { data, error, retry } = usePublicData<MobilePublicHome>();
  return <View style={{ gap: 10 }}>
    <View style={{ paddingHorizontal: 4, gap: 2 }}><T style={{ fontFamily: "NunitoBold", fontSize: 17 }}>Trip ideas</T><Muted>4-day itineraries to make your own</Muted></View>
    {error ? <ErrorNotice message={error} retry={retry} /> : !data ? <Loading /> : <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={232} decelerationRate="fast" style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingVertical: 4 }}>
      {data.guides.map(guide => <PhotoCard key={guide.slug} source={photo(guide.image)} height={290} radius={22} style={{ width: 220 }} label={`${guide.city}, ${guide.dayCount}-day example itinerary`} onPress={() => router.push({ pathname: "/guide/[slug]", params: { slug: guide.slug } })} top={<Badge onImage>{`${guide.dayCount} days`}</Badge>}>
        <OnPhoto size="small">{guide.country}</OnPhoto><OnPhoto size="title" style={{ fontSize: 23, lineHeight: 28 }}>{guide.city}</OnPhoto>
      </PhotoCard>)}
    </ScrollView>}
  </View>;
}

function HowItWorks() {
  const c = useTheme(); const { width } = useWindowDimensions(); const card = Math.min(300, width - 72);
  return <View style={{ gap: 10 }}>
    <T style={{ fontFamily: "NunitoBold", fontSize: 17, paddingHorizontal: 4 }}>How it works</T>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={card + 12} decelerationRate="fast" style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingVertical: 4 }}>
      {HOME_SCENES.map((step, i) => <Card key={step.label} style={{ width: card, gap: 10 }}>
        <View style={styles.row}><View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}><T style={{ color: c.accentText, fontFamily: "NunitoBold" }}>{i + 1}</T></View><Eyebrow>{step.label}</Eyebrow></View>
        <Heading small>{step.title}</Heading><Muted>{step.copy}</Muted>
        <View style={{ backgroundColor: c.bg, borderRadius: 14, padding: 12, gap: 8 }}><T style={{ fontSize: 11, color: c.muted, fontFamily: "NunitoBold", letterSpacing: 1, textTransform: "uppercase" }}>{step.note}</T>{step.rows.map(([label, value]) => <View key={label} style={styles.row}><T style={{ color: c.muted, fontSize: 12 }}>{label}</T><T style={{ fontSize: 13, textAlign: "right", flexShrink: 1 }}>{value}</T></View>)}</View>
      </Card>)}
    </ScrollView>
  </View>;
}

function PremiumPromo() {
  const c = useTheme();
  return <Card style={{ backgroundColor: c.accent, gap: 8 }} onPress={() => router.push("/plans")} accessibilityLabel="Compare plans">
    <View style={styles.row}><Eyebrow color={c.dark ? c.accentText : "#f6e3da"}>One trip · everyone included</Eyebrow><Icon name="sparkles" color={c.accentText} size={20} /></View>
    <T style={{ fontFamily: "NunitoHeading", fontSize: 24, lineHeight: 30, color: c.accentText }}>Start free. Upgrade a trip for $15.</T>
    <T style={{ color: c.accentText, opacity: 0.85, fontSize: 14 }}>Every day planned, group chat, shared expenses and events nearby. One payment, no subscription.</T>
  </Card>;
}

export function NativeHome() {
  const c = useTheme(); const { data: session } = authClient.useSession();
  if (session) return <Screen>
    <View style={[styles.row, { paddingTop: 4 }]}><View style={{ flex: 1, gap: 2 }}><Muted>{greeting()}, {session.user.name?.split(" ")[0] || "traveler"}</Muted></View><Button compact leadingIcon="add" onPress={() => router.push(workspaceHref({ screen: "new" }))}>New trip</Button></View>
    <NextTrip />
    <View style={{ flexDirection: "row", gap: 8 }}>
      <QuickAction icon="add" label="New trip" tint={c.accent} onPress={() => router.push(workspaceHref({ screen: "new" }))} />
      <QuickAction icon="compass-outline" label="Find a place" onPress={() => router.push("/destinations")} />
      <QuickAction icon="mail-open-outline" label="Invitations" onPress={() => router.push(workspaceHref({ screen: "trips" }))} />
      <QuickAction icon="cloud-offline-outline" label="Offline" onPress={() => router.push("/offline")} />
    </View>
    <Explore />
    <Ideas />
    <PremiumPromo />
    <HowItWorks />
    <NativeLegalLinks />
  </Screen>;
  return <Screen style={{ paddingTop: 0 }}>
    <View style={[styles.row, { paddingTop: 8 }]}><Brand /><Button compact secondary onPress={() => router.push("/sign-in")}>Sign in</Button></View>
    <PhotoCard source={photo("/editorial/home.webp")} height={460} radius={28} scrim={0.88} label="Porto waterfront on the Douro River">
      <Eyebrow color="#f6e3da">Your trip organizer</Eyebrow>
      <T style={{ fontFamily: "NunitoHeading", fontSize: 40, lineHeight: 44, color: "#fff", letterSpacing: -1 }}>Plan less.{"\n"}Travel more.</T>
      <OnPhoto>Your itinerary, bookings and group in one place.</OnPhoto>
      <View style={{ marginTop: 12, gap: 10 }}><CreateTripButton label="Plan a trip — it's free" /><Button secondary onPress={() => router.push({ pathname: "/guide/[slug]", params: { slug: "lisbon-porto" } })} trailingIcon="arrow-forward">See an example trip</Button></View>
    </PhotoCard>
    <HowItWorks />
    <Explore />
    <Ideas />
    <PremiumPromo />
    <View style={{ alignItems: "center", gap: 6, paddingTop: 8 }}><Brand /><Muted>Plan less. Travel more.</Muted></View>
    <NativeLegalLinks />
  </Screen>;
}

