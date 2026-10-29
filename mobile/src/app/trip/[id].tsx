import { NativePublicHeader } from "../../components/public-header";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Button, Card, ErrorNotice, Eyebrow, Heading, Icon, Loading, Muted, Screen, T, styles } from "../../components/ui";
import { useTheme } from "../../components/theme";
import { dayLabel, roleLabel, tripDates, useApi } from "../../lib/data";
import { authClient } from "../../lib/auth";
import { readOfflineItinerary } from "../../lib/offline";
import type { MobileItinerary, MobileStop } from "../../lib/types";

function safeOpen(url: string | null) { if (!url) return; try { const parsed = new URL(url); if (["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password) void Linking.openURL(parsed.href); } catch {} }
function openMap(stop: MobileStop) {
  const query = [stop.title, stop.address].filter(Boolean).join(", ");
  safeOpen(Platform.OS === "ios" ? `https://maps.apple.com/?q=${encodeURIComponent(query)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
}

export default function ItineraryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const c = useTheme();
  const { data: live, error, loading, reload, status } = useApi<MobileItinerary>(`/api/mobile/trips/${encodeURIComponent(typeof id === "string" && id ? id : "invalid")}`);
  const { data: session } = authClient.useSession();
  const [offline, setOffline] = useState<{ owner: string; saved: { savedAt: string; data: MobileItinerary } | null } | null>(null);
  useEffect(() => { let cancelled = false; if (session?.user.id) void readOfflineItinerary(session.user.id, id).then(value => { if (!cancelled) setOffline({ owner: session.user.id, saved: value }); }); return () => { cancelled = true; }; }, [session?.user.id, id]);
  const saved = offline?.owner === session?.user.id && offline?.saved?.data.trip.id === id ? offline.saved : null;
  const mayUseOffline = Boolean(error && ![401, 403, 404].includes(status ?? 0));
  const data = live ?? (mayUseOffline ? saved?.data ?? null : null);
  const [selection, setSelection] = useState<{ tripId: string; date: string } | null>(null);
  const date = selection?.tripId === id ? selection.date : null;
  const day = data?.days.find(d => d.date === date) ?? data?.days.find(d => d.date === data.today) ?? data?.days[0];
  return <Screen header={<NativePublicHeader active="trip" />}><View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="Back to my trips" onPress={() => router.canGoBack() ? router.back() : router.replace("/trips")} style={{ padding: 8, marginLeft: -8 }}><Icon name="arrow-back" /></Pressable><Eyebrow>Itinerary</Eyebrow><Pressable accessibilityRole="button" accessibilityLabel="Refresh itinerary" onPress={() => void reload()} style={{ padding: 8 }}><Icon name="refresh-outline" /></Pressable></View>
    {!live && saved && mayUseOffline && <Muted>Saved offline · {saved.savedAt}. Read-only; refresh when connected.</Muted>}{error && (!saved || !mayUseOffline) && <ErrorNotice message={error} retry={() => void reload()} />}{loading && !data && <Loading />}
    {data && <>
      {data.trip.image && <Image source={data.trip.image.url} accessibilityLabel={data.trip.destinations.join(", ")} contentFit="cover" style={{ height: 185, width: "100%", borderRadius: 22 }} />}
      <View style={{ gap: 9 }}><View style={styles.row}><Eyebrow>{data.trip.destinations.join(" · ") || "Your adventure"}</Eyebrow>{data.trip.premium && <T style={{ fontSize: 12, color: c.accent }}>★ Premium</T>}</View><Heading>{data.trip.name}</Heading><Muted>{tripDates(data.trip.startDate, data.trip.endDate)}</Muted><Muted>{roleLabel(data.trip.role)} · {data.trip.travelers.join(", ")}</Muted></View>
      {data.trip.image && <T style={{ color: c.muted, fontSize: 10 }}>Photo: {data.trip.image.credit}</T>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }} accessibilityLabel="Trip days">{data.days.map((d, index) => <Pressable key={d.id} accessibilityRole="button" accessibilityState={{ selected: day?.id === d.id }} accessibilityLabel={`Day ${index + 1}, ${dayLabel(d.date)}`} onPress={() => setSelection({ tripId: id, date: d.date })} style={{ backgroundColor: d.id === day?.id ? c.accent : c.paper, borderRadius: 18, padding: 16, minWidth: 84, alignItems: "center", borderWidth: 1, borderColor: c.line, gap: 3 }}><T style={{ color: d.id === day?.id ? c.accentText : c.muted, fontSize: 11 }}>DAY {index + 1}</T><T style={{ color: d.id === day?.id ? c.accentText : c.ink, fontFamily: "InterSemibold", fontSize: 14 }}>{dayLabel(d.date)}</T></Pressable>)}</ScrollView>
      {!day ? <Card><Heading small>The dates are still open.</Heading><Muted>Add trip dates on Tripanize to see your itinerary here.</Muted></Card> : <>
        <View style={{ gap: 7 }}><Eyebrow>{dayLabel(day.date, { weekday: "long" })} · {day.destination || "Your day"}</Eyebrow><Heading small>{day.title || "A day to remember"}</Heading>{day.area && <Muted>{day.area}</Muted>}{day.notes && <T>{day.notes}</T>}</View>
        {!day.stops.length && <Card><Icon name="sunny-outline" /><Heading small>A little room to wander.</Heading><Muted>No stops planned for this day yet.</Muted></Card>}
        {day.stops.map((stop, index) => <View key={stop.id} style={{ flexDirection: "row", gap: 13 }}><View style={{ width: 48, alignItems: "center", paddingTop: 16, gap: 8 }}><T style={{ color: c.accent, fontFamily: "InterSemibold", fontSize: 12 }}>{stop.startTime || `0${index + 1}`.slice(-2)}</T><View style={{ width: 1, flex: 1, minHeight: 30, backgroundColor: c.line }} /></View><Card style={{ flex: 1, padding: 18 }}><Eyebrow>{stop.category.replaceAll("_", " ")}</Eyebrow><T style={{ fontFamily: "Fraunces", fontSize: 23, lineHeight: 29 }}>{stop.title}</T>{stop.reason && <T style={{ fontSize: 13 }}>{stop.reason}</T>}{stop.address && <Muted>{stop.address}</Muted>}{stop.durationMin !== null && <Muted>{stop.durationMin} min{stop.bookingStatus ? ` · ${stop.bookingStatus.toLowerCase().replaceAll("_", " ")}` : stop.bookingRequired ? " · Booking needed" : ""}</Muted>}{stop.notes && <Muted>{stop.notes}</Muted>}<View style={{ flexDirection: "row", gap: 20, marginTop: 2 }}><Pressable accessibilityRole="button" accessibilityLabel={`Directions to ${stop.title}`} onPress={() => openMap(stop)} style={{ paddingVertical: 8 }}><T style={{ color: c.accent, fontSize: 13 }}>Directions ↗</T></Pressable>{stop.officialUrl && <Pressable accessibilityRole="link" accessibilityLabel={`Official information for ${stop.title}`} onPress={() => safeOpen(stop.officialUrl)} style={{ paddingVertical: 8 }}><T style={{ color: c.accent, fontSize: 13 }}>Website ↗</T></Pressable>}</View></Card></View>)}
        {(["breakfast", "lunch", "dinner"] as const).map(meal => day.meals[meal].length ? <View key={meal} style={{ gap: 12 }}><Eyebrow>At the table</Eyebrow><Heading small>{meal[0].toUpperCase() + meal.slice(1)}</Heading>{day.meals[meal].map(restaurant => <Card key={restaurant.name}><T style={{ fontFamily: "InterSemibold", fontSize: 17 }}>{restaurant.name}</T><Muted>{restaurant.cuisine} · {restaurant.area}</Muted><T style={{ fontSize: 13 }}>{restaurant.whyFits}</T><Pressable accessibilityRole="link" accessibilityLabel={`Information for ${restaurant.name}`} onPress={() => safeOpen(restaurant.officialUrl || restaurant.sourceUrls[0])} style={{ paddingVertical: 7 }}><T style={{ color: c.accent, fontSize: 13 }}>View restaurant ↗</T></Pressable></Card>)}</View> : null)}
      </>}
      <Button secondary busy={loading} onPress={() => void reload()}>Refresh itinerary</Button>
    </>}
  </Screen>;
}
