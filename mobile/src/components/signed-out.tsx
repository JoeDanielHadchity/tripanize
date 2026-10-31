import { Linking, View } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, EmptyState, Heading, Icon, ListRow, Muted, Screen, ScreenHeader, Section, Segmented, T, styles, type IconName } from "./ui";
import { useAppearance, useTheme } from "./theme";

const signIn = (next: string) => router.push({ pathname: "/sign-in", params: { next } });
const openSite = (path: string) => { void Linking.openURL(`https://www.tripanize.app/${path}`).catch(() => undefined); };

/** A sign-in card shared by the signed-out tabs. */
function SignInCard({ next, title, text }: { next: string; title: string; text: string }) {
  const c = useTheme();
  return <Card style={{ backgroundColor: c.accent, gap: 10 }}>
    <T style={{ fontFamily: "Fraunces", fontSize: 23, lineHeight: 29, color: c.accentText }}>{title}</T>
    <T style={{ color: c.accentText, opacity: 0.88, fontSize: 14, lineHeight: 21 }}>{text}</T>
    <Button secondary leadingIcon="mail-outline" onPress={() => signIn(next)} style={{ marginTop: 4 }}>Sign in with email</Button>
    <T style={{ color: c.accentText, opacity: 0.75, fontSize: 12, textAlign: "center" }}>New here? The same step creates your free account.</T>
  </Card>;
}

const PREVIEW: { icon: IconName; title: string; text: string; when: string }[] = [
  { icon: "chatbubbles-outline", title: "Lisbon long weekend", text: "Sam sent a message in trip chat.", when: "2 min" },
  { icon: "musical-notes-outline", title: "New event for Lisbon", text: "Fado night in Alfama · Sat 14", when: "1 h" },
  { icon: "hand-left-outline", title: "Lisbon long weekend", text: "Maya started a vote: Sintra or Cascais?", when: "3 h" },
  { icon: "alarm-outline", title: "Day 2 · Belém & the riverside", text: "09:30 Jerónimos Monastery · Pastéis de Belém", when: "8:00" },
];

export function SignedOutInbox() {
  const c = useTheme();
  return <Screen>
    <ScreenHeader title="Inbox" subtitle="Everything your group does, in one place." />
    <View style={{ gap: 8 }}>
      <Muted style={{ paddingHorizontal: 4 }}>What you’ll see here</Muted>
      <Card style={{ paddingVertical: 4, gap: 0 }}>{PREVIEW.map((n, i) => <View key={i} style={{ flexDirection: "row", gap: 12, paddingVertical: 13, borderBottomWidth: i === PREVIEW.length - 1 ? 0 : 0.5, borderBottomColor: c.line, opacity: 1 - i * 0.12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.soft, alignItems: "center", justifyContent: "center" }}><Icon name={n.icon} size={18} /></View>
        <View style={{ flex: 1, gap: 2 }}><View style={styles.row}><T numberOfLines={1} style={{ flex: 1, fontFamily: "InterSemibold", fontSize: 14 }}>{n.title}</T><T style={{ fontSize: 11, color: c.muted }}>{n.when}</T></View><T style={{ fontSize: 14, lineHeight: 20, color: c.muted }}>{n.text}</T></View>
      </View>)}</Card>
      <Muted style={{ paddingHorizontal: 4, fontSize: 12 }}>Examples. Your real alerts appear once you’re signed in.</Muted>
    </View>
    <SignInCard next="inbox" title="Stay in the loop" text="Get chat messages, new events near your stops, group votes, shared expenses and a reminder with each day's plan." />
  </Screen>;
}

export function SignedOutTrips() {
  return <Screen>
    <ScreenHeader title="Trips" />
    <EmptyState icon="airplane-outline" title="Your trips live here" text="Plan day by day, invite your group and keep bookings, costs and chat together." />
    <SignInCard next="trips" title="Plan your first trip" text="Sign in to create a trip, or join one you've been invited to." />
    <Button secondary trailingIcon="arrow-forward" onPress={() => router.push({ pathname: "/guide/[slug]", params: { slug: "lisbon-porto" } })}>See an example trip</Button>
  </Screen>;
}

export function SignedOutAccount() {
  const c = useTheme(), appearance = useAppearance();
  return <Screen>
    <View style={{ alignItems: "center", gap: 8, paddingTop: 10 }}>
      <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: c.soft, alignItems: "center", justifyContent: "center" }}><Ionicons name="person" size={36} color={c.accent} /></View>
      <Heading>Welcome</Heading><Muted>Sign in to sync your trips across devices.</Muted>
    </View>
    <SignInCard next="account" title="Your Tripanize account" text="One account for the app and tripanize.app. Sign in with a code sent to your email; no password needed." />
    <Section title="Appearance"><View style={{ paddingVertical: 12 }}><Segmented label="Appearance" value={appearance.choice} onChange={appearance.set} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "Auto" }]} /></View></Section>
    <Section title="Explore">
      <ListRow icon="map-outline" title="Example trip" subtitle="Lisbon & Porto in 4 days" onPress={() => router.push({ pathname: "/guide/[slug]", params: { slug: "lisbon-porto" } })} />
      <ListRow icon="sparkles-outline" title="Plans & pricing" subtitle="Start free · $15 per trip for Premium" onPress={() => router.push("/plans")} />
      <ListRow icon="cloud-offline-outline" title="Saved offline itineraries" onPress={() => router.push("/offline")} last />
    </Section>
    <Section title="Help & legal">
      <ListRow icon="help-buoy-outline" title="Contact support" onPress={() => openSite("contact")} />
      <ListRow icon="document-text-outline" title="Terms" onPress={() => openSite("terms")} />
      <ListRow icon="shield-checkmark-outline" title="Privacy" onPress={() => openSite("privacy")} />
      <ListRow icon="receipt-outline" title="Refunds" onPress={() => openSite("refunds")} last />
    </Section>
    <Muted style={{ textAlign: "center" }}>Tripanize {Constants.expoConfig?.version ?? ""}</Muted>
  </Screen>;
}
