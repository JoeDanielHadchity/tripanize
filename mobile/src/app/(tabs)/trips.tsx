import { useCallback, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { Button, Card, ErrorNotice, Eyebrow, Heading, Icon, Loading, Muted, Screen, T, styles } from "../../components/ui";
import { useTheme } from "../../components/theme";
import { roleLabel, tripDates, useApi } from "../../lib/data";
import { workspaceHref } from "../../lib/workspace";
import type { MobileTripCard } from "../../lib/types";

export default function TripsScreen() {
  const c = useTheme(); const { data, loading, error, reload } = useApi<{ trips: MobileTripCard[] }>("/api/mobile/trips");
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState("Upcoming");
  const trips = data?.trips.filter(t => (filter === "All" || (filter === "Past" ? t.phase === "past" : t.phase !== "past")) && [t.name, ...t.destinations].join(" ").toLowerCase().includes(search.toLowerCase().trim())) ?? [];
  return <Screen><View style={{ gap: 9, marginTop: 12 }}><Eyebrow>Keep the good plans</Eyebrow><Heading>My trips.</Heading></View>
    <Button trailingIcon="arrow-forward" onPress={() => router.push(workspaceHref({ screen: "new" }))}>Create a trip</Button><Button secondary onPress={() => router.push(workspaceHref({ screen: "trips" }))}>Invitations & trials</Button>
    <TextInput accessibilityLabel="Search trips" placeholder="Search a trip or destination" placeholderTextColor={c.muted} value={search} onChangeText={setSearch} style={{ backgroundColor: c.paper, color: c.ink, fontFamily: "Inter", borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 16, fontSize: 15 }} />
    <View style={{ flexDirection: "row", gap: 9 }}>{["Upcoming", "Past", "All"].map(label => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: filter === label }} onPress={() => setFilter(label)} style={{ paddingVertical: 10, paddingHorizontal: 17, borderRadius: 24, backgroundColor: filter === label ? c.accent : c.soft }}><T style={{ color: filter === label ? c.accentText : c.ink, fontSize: 13, fontFamily: "InterSemibold" }}>{label}</T></Pressable>)}</View>
    {error && <ErrorNotice message={error} retry={() => void reload()} />}{loading && !data && <Loading />}
    {!loading && data && !trips.length && <Card><Heading small>{search ? "No matching trips." : "Room for a new adventure."}</Heading><Muted>{data.trips.length ? "Try another filter or search." : "Trips you create or join on Tripanize will appear here."}</Muted></Card>}
    {trips.map(trip => <Pressable key={trip.id} accessibilityRole="button" accessibilityLabel={`Open ${trip.name}`} onPress={() => router.push(workspaceHref({ screen: trip.onboardingStage === "COMPLETE" ? "itinerary" : "setup", tripId: trip.id }))} style={{ backgroundColor: c.paper, borderRadius: 16, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
      {trip.image ? <Image source={trip.image.url} accessibilityLabel={trip.destinations.join(", ")} contentFit="cover" style={{ height: 190, width: "100%" }} /> : <View style={{ height: 135, backgroundColor: c.soft, justifyContent: "center", alignItems: "center", gap: 8 }}><Icon name="map-outline" size={32} /><T style={{ fontFamily: "Fraunces", fontSize: 26 }}>{trip.destinations[0] ?? "A new adventure"}</T></View>}
      <View style={{ padding: 20, gap: 9 }}><View style={styles.row}><Eyebrow>{trip.destinations.join(" · ") || "Your trip"}</Eyebrow>{trip.premium && <T style={{ color: c.accent, fontSize: 12 }}>★ Premium</T>}</View><Heading small>{trip.name}</Heading><Muted>{tripDates(trip.startDate, trip.endDate)}</Muted><View style={styles.row}><Muted>{trip.travelers.length} travelers · {roleLabel(trip.role)}</Muted><Icon name="arrow-forward" /></View>{trip.image?.credit && <T style={{ fontSize: 9, lineHeight: 13, color: c.muted }}>Photo: {trip.image.credit}</T>}</View>
    </Pressable>)}
    {data && <Button secondary onPress={() => void reload()} busy={loading}>Refresh trips</Button>}
  </Screen>;
}
