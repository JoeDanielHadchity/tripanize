import { useEffect, useState } from "react";
import { router } from "expo-router";
import { listOfflineItineraries, clearOfflineItineraries } from "../lib/offline";
import type { MobileItinerary } from "../lib/types";
import { Button, Card, ErrorNotice, Heading, Muted, Screen, ScreenHeader, T } from "../components/ui";
export default function OfflineScreen() {
  const [items, setItems] = useState<{ savedAt: string; data: MobileItinerary }[]>([]), [selected, setSelected] = useState<string | null>(null), [date, setDate] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => { void listOfflineItineraries().then(setItems).catch(() => setError("Could not read saved itineraries.")); }, []);
  const snapshot = items.find(i => i.data.trip.id === selected), day = snapshot?.data.days.find(d => d.date === date) ?? snapshot?.data.days[0];
  return <Screen><ScreenHeader back title="Saved itineraries" subtitle="Read-only copies kept on this device for up to 30 days. Connect to refresh your trip. Signing out removes these copies." />{error && <ErrorNotice message={error} />}
    {!items.length && <Card><T>No itineraries saved on this device.</T></Card>}
    {items.map(i => <Button secondary key={i.data.trip.id} onPress={() => { setSelected(i.data.trip.id); setDate(null); }}>{i.data.trip.name}</Button>)}
    {snapshot && <><Heading small>{snapshot.data.trip.name}</Heading><Muted>Saved {snapshot.savedAt}</Muted>{snapshot.data.days.map(d => <Button secondary key={d.id} onPress={() => setDate(d.date)}>{d.date}{d.title ? ` · ${d.title}` : ""}</Button>)}{day && <Heading small>{day.date}</Heading>}{day?.stops.map(s => <Card key={s.id}><Heading small>{s.title}</Heading><Muted>{s.startTime ?? "Anytime"}{s.durationMin ? ` · ${s.durationMin} min` : ""}</Muted>{s.address && <T>{s.address}</T>}{s.notes && <T>{s.notes}</T>}</Card>)}</>}
    <Button secondary onPress={() => router.replace("/")}>Back to Tripanize</Button><Button secondary onPress={() => void clearOfflineItineraries().then(() => setItems([])).catch(() => setError("Could not clear saved itineraries."))}>Remove all saved itineraries</Button>
  </Screen>;
}
