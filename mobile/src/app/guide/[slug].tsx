import { useState } from "react";
import { Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { authClient, photo, post } from "../../lib/auth";
import { publicHttpsLink, usePublicData, type MobilePublicGuide } from "../../lib/public-data";
import { workspaceHref, type MobileCommandResult } from "../../lib/workspace";
import { Button, Card, ErrorNotice, Eyebrow, Heading, Loading, Muted, Screen, T, styles } from "../../components/ui";
import { useTheme } from "../../components/theme";

function OfficialLink({ label, url }: { label: string; url?: string }) {
  const c = useTheme(); const safe = publicHttpsLink(url); const [error, setError] = useState(false);
  if (!safe) return null;
  return <View>{error && <Muted>Could not open this link.</Muted>}<Pressable accessibilityRole="link" onPress={() => void Linking.openURL(safe).catch(() => setError(true))} style={{ paddingVertical: 10 }}><T style={{ color: c.accent, fontSize: 13 }}>{label} ↗</T></Pressable></View>;
}

export default function GuideScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  // Remount when changing cities so a selected day or save draft never crosses guides.
  return <Guide key={slug} slug={slug} />;
}
function Guide({ slug }: { slug: string }) {
  const c = useTheme(); const { data, error, retry } = usePublicData<MobilePublicGuide>(slug);
  const { data: session } = authClient.useSession();
  const [selected, setSelected] = useState(0), [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false), [saveError, setSaveError] = useState<string | null>(null);
  const day = data?.days[selected];
  async function saveCopy() {
    if (!session) { router.push({ pathname: "/sign-in", params: { next: `guide:${slug}` } }); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { setSaveError("Choose a start date: YYYY-MM-DD."); return; }
    setBusy(true); setSaveError(null);
    try {
      const result = await post<MobileCommandResult>("/api/mobile/workspace", { action: "example.copy", values: { slug, startDate } });
      if (result.to?.tripId) router.replace(workspaceHref({ screen: "itinerary", tripId: result.to.tripId }));
    } catch (e) { setSaveError(e instanceof Error ? e.message : "Could not save a copy."); }
    finally { setBusy(false); }
  }
  return <Screen>{error ? <ErrorNotice message={error} retry={retry} /> : !data ? <Loading /> : <>
    <Image source={photo(data.image)} accessibilityLabel={data.alt} style={{ width: "100%", aspectRatio: 1.5, borderRadius: 20 }} contentFit="cover" />
    <Eyebrow>Example trip · {data.days.length} days</Eyebrow><Heading>{data.title}</Heading><T>{data.intro}</T><Muted>Suggested times and planning estimates. Check current hours, weather and prices before you travel.</Muted>
    <Card><Heading small>Make it your trip.</Heading><Muted>Save an editable copy with your own dates. Nothing is booked for you.</Muted>{session && <><T style={{ fontFamily: "InterSemibold", fontSize: 13 }}>Trip start date</T><TextInput accessibilityLabel="Trip start date, YYYY-MM-DD" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} autoCapitalize="none" maxLength={10} style={{ borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 15, color: c.ink, fontFamily: "Inter", fontSize: 16 }} /></>}{saveError && <ErrorNotice message={saveError} />}<Button busy={busy} onPress={() => void saveCopy()}>{session ? "Save a copy" : "Sign in to save a copy"}</Button></Card>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist">{data.days.map((d, i) => <Pressable key={i} accessibilityRole="tab" accessibilityLabel={`Day ${i + 1}: ${d.title}`} accessibilityState={{ selected: selected === i }} onPress={() => setSelected(i)} style={{ padding: 15, backgroundColor: selected === i ? c.accent : c.soft, borderRadius: 12 }}><T style={{ color: selected === i ? c.accentText : c.ink, fontFamily: "InterSemibold" }}>Day {i + 1}</T></Pressable>)}</ScrollView>
    {day && <View style={{ gap: 16 }}><Eyebrow>Day {selected + 1} · {day.area}</Eyebrow><Heading small>{day.title}</Heading>{!!day.note && <Muted>{day.note}</Muted>}{day.stops.map((stop, i) => <Card key={i}><View style={styles.row}><Eyebrow>{stop.time}</Eyebrow><Muted>{stop.duration}</Muted></View><Heading small>{stop.title}</Heading><T>{stop.detail}</T><OfficialLink label="Official information" url={stop.url} /></Card>)}{day.food && <Card><Heading small>Food nearby</Heading><T>{day.food}</T></Card>}{day.planB && <Card><Heading small>If plans change</Heading><T>{day.planB}</T></Card>}</View>}
    {data.budget && <Card><Heading small>Estimated budget</Heading><T>{data.budget.range} · {data.budget.currency}</T><Muted>{data.budget.note}</Muted>{data.budget.rows.map((row, i) => <View key={i} style={{ gap: 4, paddingVertical: 8, borderTopWidth: 1, borderColor: c.line }}>{row.map((text, j) => <T key={j} style={{ fontSize: 13, color: j ? c.muted : c.ink }}>{text}</T>)}</View>)}</Card>}
    {data.tips.map(tip => <Card key={tip.title}><Heading small>{tip.title}</Heading><T>{tip.text}</T></Card>)}
    {!!data.bookings.length && <Heading small>Booking suggestions</Heading>}{data.bookings.map((b, i) => <Card key={i}><T style={{ fontFamily: "InterSemibold" }}>{b.label}</T><Muted>{b.note}</Muted><OfficialLink label="Check with the provider" url={b.url} /></Card>)}
    {!!data.sources.length && <Card><Heading small>Sources</Heading>{data.sources.map((s, i) => <OfficialLink key={i} label={s.label} url={s.url} />)}</Card>}
  </>}</Screen>;
}
