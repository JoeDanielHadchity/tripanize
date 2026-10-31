import { useCallback, useState } from "react";
import { RefreshControl, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Badge, EmptyState, ErrorNotice, IconButton, Icon, Loading, OnPhoto, PhotoCard, Screen, ScreenHeader, Segmented, Button, styles } from "../../components/ui";
import { useTheme } from "../../components/theme";
import { countdown } from "../../components/native-home";
import { roleLabel, tripDates, useApi } from "../../lib/data";
import { workspaceHref } from "../../lib/workspace";
import type { MobileTripCard } from "../../lib/types";

type Filter = "upcoming" | "past" | "all";

export default function TripsScreen() {
  const c = useTheme(); const { data, loading, error, reload } = useApi<{ trips: MobileTripCard[] }>("/api/mobile/trips");
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState<Filter>("upcoming"); const [searching, setSearching] = useState(false);
  const needle = search.toLowerCase().trim();
  const trips = (data?.trips.filter(t => (filter === "all" || (filter === "past" ? t.phase === "past" : t.phase !== "past")) && [t.name, ...t.destinations].join(" ").toLowerCase().includes(needle)) ?? [])
    .sort((a, b) => filter === "past" ? (b.startDate ?? "").localeCompare(a.startDate ?? "") : (a.startDate ?? "9").localeCompare(b.startDate ?? "9"));
  const open = (trip: MobileTripCard) => router.push(workspaceHref({ screen: trip.onboardingStage === "COMPLETE" ? "itinerary" : "setup", tripId: trip.id }));
  return <Screen refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={c.accent} />}>
    <ScreenHeader title="Trips" subtitle={data ? `${data.trips.length} ${data.trips.length === 1 ? "trip" : "trips"}` : undefined} right={<><IconButton name="search" label="Search trips" onPress={() => { setSearching(!searching); if (searching) setSearch(""); }} /><IconButton name="mail-open-outline" label="Invitations and trials" onPress={() => router.push(workspaceHref({ screen: "trips" }))} /><IconButton name="add" label="Create a trip" filled onPress={() => router.push(workspaceHref({ screen: "new" }))} /></>} />
    {searching && <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.paper, borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line }}><Icon name="search" size={18} color={c.muted} /><TextInput autoFocus accessibilityLabel="Search trips" placeholder="Search a trip or destination" placeholderTextColor={c.muted} value={search} onChangeText={setSearch} style={{ flex: 1, color: c.ink, fontFamily: "Inter", fontSize: 16, minHeight: 50 }} /></View>}
    <Segmented label="Show trips" value={filter} onChange={setFilter} options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, { value: "all", label: "All" }]} />
    {error && <ErrorNotice message={error} retry={reload} />}{loading && !data && <Loading />}
    {data && !trips.length && <EmptyState icon={needle ? "search" : filter === "past" ? "time-outline" : "airplane-outline"} title={needle ? "No matching trips" : filter === "past" ? "No past trips yet" : "Room for a new adventure"} text={data.trips.length ? "Try another filter or search." : "Trips you create or join appear here."} action={!data.trips.length ? <Button leadingIcon="add" onPress={() => router.push("/start")}>Create a trip</Button> : undefined} />}
    {trips.map(trip => { const when = trip.phase === "past" ? null : countdown(trip.startDate, trip.endDate); return <PhotoCard key={trip.id} source={trip.image?.url} height={230} label={`Open ${trip.name}`} onPress={() => open(trip)}
      top={<><View style={{ flexDirection: "row", gap: 6 }}>{when && <Badge onImage icon="time-outline">{when}</Badge>}{trip.onboardingStage !== "COMPLETE" && <Badge onImage icon="construct-outline">Setup</Badge>}</View>{trip.premium && <Badge onImage icon="sparkles">Premium</Badge>}</>}>
      <OnPhoto size="small">{trip.destinations.join(" · ") || "Your trip"}</OnPhoto>
      <OnPhoto size="title">{trip.name}</OnPhoto>
      <View style={styles.row}><OnPhoto>{tripDates(trip.startDate, trip.endDate)}</OnPhoto><OnPhoto size="small">{trip.travelers.length || 1} · {roleLabel(trip.role)}</OnPhoto></View>
      {trip.image?.credit && <OnPhoto size="small" style={{ fontSize: 9, lineHeight: 12, opacity: 0.7 }}>Photo: {trip.image.credit}</OnPhoto>}
    </PhotoCard>; })}
  </Screen>;
}
