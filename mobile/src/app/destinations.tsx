import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, ErrorNotice, Eyebrow, Heading, Icon, Loading, Muted, Screen, T, styles } from "../components/ui";
import { useTheme } from "../components/theme";
import { useApi } from "../lib/data";
import type { MobileDestinationSearch } from "../lib/types";

export default function DestinationsScreen() {
  const c = useTheme(); const { data, error, loading, reload } = useApi<{ searches: MobileDestinationSearch[] }>("/api/mobile/destinations");
  const [selected, setSelected] = useState<string | null>(null);
  const search = data?.searches.find(s => s.id === selected) ?? data?.searches[0];
  return <Screen><Pressable accessibilityRole="button" accessibilityLabel="Back to start" onPress={() => router.canGoBack() ? router.back() : router.replace("/")}><Icon name="arrow-back" /></Pressable>
    <View style={{ gap: 9 }}><Eyebrow>Follow your curiosity</Eyebrow><Heading>Somewhere{"\n"}you’ll love.</Heading><Muted>Your saved destination ideas.</Muted></View>
    {error && <ErrorNotice message={error} retry={() => void reload()} />}{loading && !data && <Loading />}
    {!!data?.searches.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{data.searches.map(s => <Pressable key={s.id} accessibilityRole="button" accessibilityState={{ selected: search?.id === s.id }} onPress={() => setSelected(s.id)} style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 22, backgroundColor: s.id === search?.id ? c.accent : c.soft }}><T style={{ fontSize: 13, color: s.id === search?.id ? c.accentText : c.ink }}>Search #{s.number}</T></Pressable>)}</ScrollView>}
    {data && !data.searches.length && <Card><Icon name="earth-outline" size={32} /><Heading small>Your next place is out there.</Heading><Muted>Destination searches saved on Tripanize will appear here.</Muted></Card>}
    {search && !search.ideas.length && <Card><Heading small>{["QUEUED", "RUNNING"].includes(search.status) ? "Finding your places…" : search.status === "FAILED" ? "This search needs another try." : "Your search is saved."}</Heading><Muted>{["QUEUED", "RUNNING"].includes(search.status) ? "Your research is still in progress." : "You can continue this search on the Tripanize website."}</Muted></Card>}
    {search?.ideas.map((idea, index) => <Card key={idea.destination + idea.country}><View style={styles.row}><Eyebrow>Idea {index + 1}</Eyebrow><Icon name="location-outline" /></View><Heading small>{idea.destination}</Heading><Muted>{idea.country} · {idea.bestTime}</Muted><T>{idea.whyFits}</T><View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12 }}><Muted>{idea.weather}</Muted></View></Card>)}
    {search?.selectedTripId && <Button onPress={() => router.push({ pathname: "/trip/[id]", params: { id: search.selectedTripId! } })}>Open my chosen trip</Button>}
    {data && <Button secondary busy={loading} onPress={() => void reload()}>Refresh ideas</Button>}
  </Screen>;
}
