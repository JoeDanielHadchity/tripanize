import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Switch, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { post } from "../lib/auth";
import { workspaceHref, type MobileCommandResult, type MobileField, type MobileValues } from "../lib/workspace";
import { useTheme } from "./theme";
import { Fields } from "./form-fields";
import { Button, Card, ErrorNotice, Eyebrow, Heading, IconButton, Muted, T, styles } from "./ui";
import { INTERESTS, TRANSPORT } from "../../../src/lib/constants";
import { CURRENCIES } from "../../../src/lib/money";

/** The website's "Create a trip" form (src/components/trip-form.tsx), drawn natively:
 * the same sections, fields, order and one-step start (where and when → travel questions). */

type Dest = { name: string; country: string; arriveDate: string; departDate: string; accommodationName: string; accommodationAddress: string; neighborhood: string; checkInTime: string; checkOutTime: string; parkingNotes: string };
type Pace = "RELAXED" | "BALANCED" | "AMBITIOUS";

const emptyDest = (): Dest => ({ name: "", country: "", arriveDate: "", departDate: "", accommodationName: "", accommodationAddress: "", neighborhood: "", checkInTime: "", checkOutTime: "", parkingNotes: "" });
const dateField = (key: string, label: string): MobileField => ({ key, label, kind: "date" });
const timeField = (key: string, label: string): MobileField => ({ key, label, kind: "time" });
const str = (v: unknown) => typeof v === "string" ? v : "";

function Collapsible({ title, hint, open: initial = false, children }: { title: string; hint?: string; open?: boolean; children: ReactNode }) {
  const c = useTheme(); const [open, setOpen] = useState(initial);
  return <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title} onPress={() => setOpen(!open)} style={({ pressed }) => ({ minHeight: 60, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ fontFamily: "NunitoHeading", fontSize: 18, lineHeight: 23 }}>{title}</T>
        {hint && <Muted style={{ fontSize: 12, lineHeight: 17 }}>{hint}</Muted>}
      </View>
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={c.muted} />
    </Pressable>
    {open && <View style={{ gap: 16, borderTopWidth: 1, borderTopColor: c.line, padding: 16 }}>{children}</View>}
  </Card>;
}

function Label({ children }: { children: ReactNode }) { return <T style={{ fontFamily: "NunitoBold", fontSize: 14 }}>{children}</T>; }

function Input({ label, value, onChange, placeholder, hint, multiline = false, keyboardType, autoCapitalize }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; multiline?: boolean; keyboardType?: KeyboardTypeOptions; autoCapitalize?: "none" | "sentences" | "words" }) {
  const c = useTheme();
  return <View style={{ gap: 8 }}>
    <Label>{label}</Label>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted} multiline={multiline} keyboardType={keyboardType} autoCapitalize={autoCapitalize}
      style={{ backgroundColor: c.bg, color: c.ink, fontFamily: "Nunito", borderWidth: 1, borderColor: c.line, borderRadius: 14, fontSize: 16, paddingHorizontal: 15, paddingVertical: 13, minHeight: multiline ? 90 : 48, textAlignVertical: multiline ? "top" : "center" }} />
    {hint && <Muted>{hint}</Muted>}
  </View>;
}

function Chip({ label, on, onPress, radio = false }: { label: string; on: boolean; onPress: () => void; radio?: boolean }) {
  const c = useTheme();
  return <Pressable accessibilityRole={radio ? "radio" : "checkbox"} accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 40, justifyContent: "center", borderRadius: 20, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.soft : c.paper, paddingHorizontal: 14, opacity: pressed ? 0.75 : 1 })}>
    <T style={{ fontSize: 14, color: on ? c.accent : c.muted, fontFamily: on ? "NunitoBold" : "Nunito" }}>{on && !radio ? "✓ " : ""}{label}</T>
  </Pressable>;
}

function Chips({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return <View style={{ gap: 8 }}>
    <Label>{label}</Label>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(o => { const on = value.includes(o); return <Chip key={o} label={o} on={on} onPress={() => onChange(on ? value.filter(x => x !== o) : [...value, o])} />; })}
    </View>
  </View>;
}

/** Type a name or place, tap Add (or Enter); entries show as removable pills. */
function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const c = useTheme(); const [draft, setDraft] = useState("");
  const add = () => { const v = draft.trim(); if (v && !items.includes(v)) onChange([...items, v]); setDraft(""); };
  return <View style={{ gap: 8 }}>
    <Label>{label}</Label>
    {items.length > 0 && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{items.map(i =>
      <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 18, backgroundColor: c.soft, paddingLeft: 12 }}>
        <T style={{ fontSize: 14 }}>{i}</T>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${i}`} hitSlop={6} onPress={() => onChange(items.filter(x => x !== i))} style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}><Ionicons name="close" size={16} color={c.muted} /></Pressable>
      </View>)}</View>}
    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
      <TextInput accessibilityLabel={label} value={draft} onChangeText={setDraft} placeholder={placeholder} placeholderTextColor={c.muted} returnKeyType="done" submitBehavior="submit" onSubmitEditing={add}
        style={{ flex: 1, backgroundColor: c.bg, color: c.ink, fontFamily: "Nunito", borderWidth: 1, borderColor: c.line, borderRadius: 14, fontSize: 16, paddingHorizontal: 15, paddingVertical: 12, minHeight: 48 }} />
      <Button compact secondary onPress={add} disabled={!draft.trim()}>Add</Button>
    </View>
  </View>;
}

function Stepper({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  const c = useTheme();
  return <View style={{ flex: 1, gap: 8 }}>
    <Label>{label}</Label>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: c.line, borderRadius: 14, backgroundColor: c.bg, padding: 4 }}>
      <IconButton name="remove" size={40} label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} />
      <T accessibilityLabel={`${value} ${label.toLowerCase()}`} style={{ fontFamily: "NunitoBold", fontSize: 18 }}>{value}</T>
      <IconButton name="add" size={40} label={`More ${label.toLowerCase()}`} disabled={value >= 50} onPress={() => onChange(Math.min(50, value + 1))} />
    </View>
  </View>;
}

/** The website uses a date-and-time input; here a calendar date plus an HH:MM time. */
function DateTime({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [parts, setParts] = useState(() => ({ date: value.slice(0, 10), time: value.slice(11, 16) }));
  const update = (next: { date: string; time: string }) => {
    setParts(next);
    onChange(next.date && /^\d{2}:\d{2}$/.test(next.time) ? `${next.date}T${next.time}` : next.date ? `${next.date}T12:00` : "");
  };
  return <View style={{ gap: 8 }}>
    <Fields fields={[dateField("date", label)]} values={{ date: parts.date || null }} onChange={v => update({ ...parts, date: str(v.date) })} />
    <Input label="Time (local)" value={parts.time} onChange={time => update({ ...parts, time })} placeholder="HH:MM, e.g. 14:30" keyboardType="numbers-and-punctuation" />
  </View>;
}

export function NewTripScreen() {
  const c = useTheme();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [t, setT] = useState({
    name: "", startDate: "", endDate: "", timezone: "", currency: "EUR", budget: "", pace: "BALANCED" as Pace,
    interests: [] as string[], transport: [] as string[], accessibility: "", preferences: "", dietary: "", restaurantPrefs: "",
    departureCity: "", arrivalLocation: "", arrivalAt: "", departureLocation: "", departureAt: "", adults: 1, children: 0,
    isRoadTrip: false, carPickupLocation: "", carPickupAt: "", carReturnLocation: "", carReturnAt: "", notes: "",
  });
  const [dests, setDests] = useState<Dest[]>([emptyDest()]);
  const [travelers, setTravelers] = useState<string[]>([]), [mustSee, setMustSee] = useState<string[]>([]), [optional, setOptional] = useState<string[]>([]);
  const [staying, setStaying] = useState<number[]>([]);
  const set = <K extends keyof typeof t>(k: K, v: (typeof t)[K]) => setT(x => ({ ...x, [k]: v }));
  const setDest = (i: number, patch: Partial<Dest>) => setDests(ds => ds.map((d, j) => j === i ? { ...d, ...patch } : d));
  const multi = dests.length > 1;

  function check(): string | null {
    if (!t.name.trim()) return "Give your trip a name.";
    if (!t.startDate || !t.endDate || !dests.some(d => d.name.trim())) return "Add your destination and both trip dates before continuing.";
    if (multi && dests.some(d => d.name.trim() && (!d.arriveDate || !d.departDate))) return "Add arrival and departure dates for each destination.";
    return null;
  }

  async function submit() {
    const problem = check();
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      const values = {
        ...t, timezone: t.timezone.trim() || null,
        // One destination uses the trip dates; stay dates only matter for multi-city trips.
        destinations: dests.filter(d => d.name.trim()).map(d => ({ ...d, arriveDate: multi ? d.arriveDate : null, departDate: multi ? d.departDate : null })),
        travelers: travelers.map(name => ({ name, isChild: false })), mustSee, optional, commitments: [],
      };
      const r = await post<MobileCommandResult>("/api/mobile/workspace", { action: "trip.start", values });
      if (r.to) router.replace(workspaceHref(r.to)); else router.replace("/trips");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the trip. Please try again."); }
    finally { setBusy(false); }
  }

  return <View style={{ flex: 1, backgroundColor: c.bg }}>
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { gap: 16 }]}>
      <View style={styles.row}><IconButton name="chevron-back" label="Back" onPress={() => router.canGoBack() ? router.back() : router.replace("/trips")} /><View /></View>
      <View style={{ gap: 6 }}><Eyebrow>Step 1 of 3 · Where and when</Eyebrow><Heading>Create a trip</Heading></View>

      <Collapsible title="Where and when" hint="The essentials. Everything else can be added later." open>
        <Input label="Trip name" value={t.name} onChange={v => set("name", v)} placeholder="e.g. Summer in Portugal" autoCapitalize="sentences" />
        <Fields fields={[dateField("startDate", "Start date"), dateField("endDate", "End date")]} values={{ startDate: t.startDate || null, endDate: t.endDate || null }} onChange={(v: MobileValues) => setT(x => ({ ...x, startDate: str(v.startDate), endDate: str(v.endDate) }))} />
        <View style={{ gap: 12 }}>
          <Label>{multi ? "Destinations, in order" : "Destination"}</Label>
          {dests.map((d, i) => <View key={i} style={{ gap: 12, borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label={multi ? `Stop ${i + 1}` : "City or region"} value={d.name} onChange={name => setDest(i, { name })} placeholder="e.g. Lisbon" autoCapitalize="words" /></View>
              {multi && <View style={{ flexDirection: "row", gap: 6, paddingBottom: 2 }}>
                <IconButton name="arrow-up" label={`Move ${d.name || "destination"} up`} disabled={i === 0} onPress={() => setDests(ds => ds.map((x, j) => j === i - 1 ? ds[i] : j === i ? ds[i - 1] : x))} />
                <IconButton name="close" label={`Remove ${d.name || "destination"}`} onPress={() => setDests(ds => ds.filter((_, j) => j !== i))} />
              </View>}
            </View>
            <Input label="Country (optional)" value={d.country} onChange={country => setDest(i, { country })} placeholder="e.g. Portugal" autoCapitalize="words" />
            {multi && <Fields fields={[dateField("arriveDate", "Arrive"), dateField("departDate", "Leave")]} values={{ arriveDate: d.arriveDate || null, departDate: d.departDate || null }} onChange={v => setDest(i, { arriveDate: str(v.arriveDate), departDate: str(v.departDate) })} />}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: staying.includes(i) }} onPress={() => setStaying(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i])} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}>
              <Ionicons name={staying.includes(i) ? "chevron-down" : "chevron-forward"} size={16} color={c.accent} />
              <T style={{ color: c.accent, fontSize: 14 }}>Where you&apos;re staying (optional)</T>
            </Pressable>
            {staying.includes(i) && <View style={{ gap: 12 }}>
              <Input label="Accommodation" value={d.accommodationName} onChange={accommodationName => setDest(i, { accommodationName })} />
              <Input label="Neighborhood or overnight stop" value={d.neighborhood} onChange={neighborhood => setDest(i, { neighborhood })} />
              <Input label="Address" value={d.accommodationAddress} onChange={accommodationAddress => setDest(i, { accommodationAddress })} />
              <Fields fields={[timeField("checkInTime", "Check-in time"), timeField("checkOutTime", "Check-out time")]} values={{ checkInTime: d.checkInTime, checkOutTime: d.checkOutTime }} onChange={v => setDest(i, { checkInTime: str(v.checkInTime), checkOutTime: str(v.checkOutTime) })} />
              {t.isRoadTrip && <Input label="Parking notes" value={d.parkingNotes} onChange={parkingNotes => setDest(i, { parkingNotes })} />}
            </View>}
          </View>)}
          <Button secondary leadingIcon="add" onPress={() => setDests(ds => [...ds, emptyDest()])}>Add another destination</Button>
          {multi && <Muted>For multi-city trips, set the dates you&apos;ll spend in each place. On a moving day, use the same date as “leave” for one place and “arrive” for the next.</Muted>}
        </View>
      </Collapsible>

      <Collapsible title="Who's going" hint="Count everyone, including yourself and children. You can add names later.">
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Stepper label="Adults" value={t.adults} min={1} onChange={v => set("adults", v)} />
          <Stepper label="Children" value={t.children} min={0} onChange={v => set("children", v)} />
        </View>
        <ListEditor label="Other travelers' names (you're added automatically)" items={travelers} onChange={setTravelers} placeholder="e.g. Sam" />
      </Collapsible>

      <Collapsible title="Travel style & budget">
        <View style={{ gap: 8 }}>
          <Label>Pace</Label>
          <View style={{ flexDirection: "row", gap: 8 }}>{(["RELAXED", "BALANCED", "AMBITIOUS"] as const).map(p =>
            <View key={p} style={{ flex: 1 }}><Chip radio label={p[0] + p.slice(1).toLowerCase()} on={t.pace === p} onPress={() => set("pace", p)} /></View>)}</View>
        </View>
        <Chips label="Interests" options={INTERESTS} value={t.interests} onChange={v => set("interests", v)} />
        <Chips label="Preferred transport" options={TRANSPORT} value={t.transport} onChange={v => set("transport", v)} />
        <Input label="Overall budget (optional)" hint="For the whole group." value={t.budget} onChange={v => set("budget", v)} placeholder="e.g. 2500" keyboardType="decimal-pad" />
        <Fields fields={[{ key: "currency", label: "Planning currency", kind: "select", options: CURRENCIES.map(v => ({ value: v, label: v })) }]} values={{ currency: t.currency }} onChange={v => set("currency", str(v.currency) || "EUR")} />
      </Collapsible>

      <Collapsible title="Getting there & around" hint="Arrival and departure times help the AI avoid impossible first and last days.">
        <Input label="Departing from" value={t.departureCity} onChange={v => set("departureCity", v)} placeholder="e.g. London" autoCapitalize="words" />
        <Input label="Arrival place" value={t.arrivalLocation} onChange={v => set("arrivalLocation", v)} placeholder="e.g. LIS airport" />
        <DateTime label="Arrival date" value={t.arrivalAt} onChange={v => set("arrivalAt", v)} />
        <Input label="Departure place" value={t.departureLocation} onChange={v => set("departureLocation", v)} placeholder="e.g. OPO airport" />
        <DateTime label="Departure date" value={t.departureAt} onChange={v => set("departureAt", v)} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
          <T style={{ flex: 1, fontFamily: "NunitoBold", fontSize: 14 }}>This is a road trip (rental or own car)</T>
          <Switch accessibilityLabel="This is a road trip" value={t.isRoadTrip} onValueChange={v => set("isRoadTrip", v)} trackColor={{ true: c.accent, false: c.line }} thumbColor="#ffffff" />
        </View>
        {t.isRoadTrip && <>
          <Input label="Car pickup place" value={t.carPickupLocation} onChange={v => set("carPickupLocation", v)} />
          <DateTime label="Pickup date" value={t.carPickupAt} onChange={v => set("carPickupAt", v)} />
          <Input label="Car return place" value={t.carReturnLocation} onChange={v => set("carReturnLocation", v)} />
          <DateTime label="Return date" value={t.carReturnAt} onChange={v => set("carReturnAt", v)} />
        </>}
        <Input label="Time zone" hint="Leave blank to detect it from your first destination. Used for the current itinerary day and timestamps." value={t.timezone} onChange={v => set("timezone", v)} placeholder="e.g. Europe/Lisbon" autoCapitalize="none" />
      </Collapsible>

      <Collapsible title="Places & commitments" hint="Must-sees are never silently dropped by the planner.">
        <ListEditor label="Must-see places" items={mustSee} onChange={setMustSee} placeholder="e.g. Jerónimos Monastery" />
        <ListEditor label="Nice-to-have places" items={optional} onChange={setOptional} placeholder="e.g. LX Factory" />
        <Muted>Fixed commitments live in the itinerary. Add or edit them there (marked “Fixed”).</Muted>
      </Collapsible>

      <Collapsible title="Food, access & preferences" hint="Only share what you're comfortable with. It's used to tailor plans for this trip.">
        <Input label="Accessibility needs" multiline value={t.accessibility} onChange={v => set("accessibility", v)} placeholder="e.g. avoid long stairs, need step-free access" />
        <Input label="Dietary requirements" value={t.dietary} onChange={v => set("dietary", v)} placeholder="e.g. vegetarian, nut allergy" />
        <Input label="Restaurant preferences" value={t.restaurantPrefs} onChange={v => set("restaurantPrefs", v)} placeholder="e.g. casual local places, one special dinner" />
        <Input label="Other preferences" multiline value={t.preferences} onChange={v => set("preferences", v)} placeholder="e.g. early risers, no museums on sunny days" />
        <Input label="Notes" multiline value={t.notes} onChange={v => set("notes", v)} />
      </Collapsible>

      {error && <ErrorNotice message={error} />}
      <Muted>Planning is free. Next come a few quick travel questions, then your first days are planned. You can add Premium later if you want more.</Muted>
      <Pressable accessibilityRole="link" onPress={() => router.push("/destinations")} style={{ paddingVertical: 4 }}>
        <T style={{ fontSize: 14, color: c.muted }}>Still deciding where to go? <T style={{ fontSize: 14, color: c.accent, fontFamily: "NunitoBold", textDecorationLine: "underline" }}>Find a destination</T></T>
      </Pressable>
    </ScrollView>
    <View style={{ borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }}>
      <Button busy={busy} trailingIcon="arrow-forward" onPress={() => { void submit(); }}>Next: travel questions</Button>
    </View>
  </View>;
}
