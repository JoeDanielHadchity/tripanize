import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Switch, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { post } from "../lib/auth";
import { workspaceHref, type MobileCommandResult, type MobileField, type MobileValues } from "../lib/workspace";
import { useTheme } from "./theme";
import { Fields } from "./form-fields";
import { Button, ErrorNotice, IconButton, Muted, T, styles } from "./ui";
import { INTERESTS, TRANSPORT } from "../../../src/lib/constants";
import { CURRENCIES } from "../../../src/lib/money";
import { GROUPS, PACES, WIZARD_STEPS, dateRangeLabel, emptyWizardDest, firstWizardProblem, peopleLabel, splitStays, suggestTripName, wizardStepError, type WizardDest } from "../../../src/lib/trip-wizard";

/** Create a trip, one question per screen: the same steps, wording and checks as the website
 * (src/components/trip-wizard.tsx), shared through src/lib/trip-wizard.ts. */

type Pace = (typeof PACES)[number]["id"];
const dateField = (key: string, label: string): MobileField => ({ key, label, kind: "date" });
const timeField = (key: string, label: string): MobileField => ({ key, label, kind: "time" });
const str = (v: unknown) => typeof v === "string" ? v : "";

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

function Box({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <View style={{ gap: 14, borderWidth: 1, borderColor: c.line, borderRadius: 18, backgroundColor: c.paper, padding: 14 }}>{children}</View>;
}

/** A big tappable card: the group quick picks and the pace choices. */
function Choice({ title, hint, on, onPress }: { title: string; hint: string; on: boolean; onPress: () => void }) {
  const c = useTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${title}, ${hint}`} onPress={onPress}
    style={({ pressed }) => ({ flexGrow: 1, flexBasis: "45%", minHeight: 64, justifyContent: "center", gap: 2, borderRadius: 18, borderWidth: on ? 2 : 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.soft : c.paper, paddingHorizontal: 14, paddingVertical: 10, opacity: pressed ? 0.8 : 1 })}>
    <T style={{ fontFamily: "NunitoHeading", fontSize: 17, color: on ? c.accent : c.ink }}>{title}</T>
    <Muted style={{ fontSize: 12, lineHeight: 16 }}>{hint}</Muted>
  </Pressable>;
}

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  const c = useTheme();
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, borderBottomWidth: 1, borderBottomColor: c.line }}>
    <Muted style={{ width: 96, fontSize: 13 }}>{label}</Muted>
    <T numberOfLines={1} style={{ flex: 1, fontSize: 15, color: value ? c.ink : c.muted }}>{value || "Skipped"}</T>
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${label}`} hitSlop={8} onPress={onEdit} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }}>
      <T style={{ color: c.accent, fontFamily: "NunitoBold", fontSize: 14 }}>Edit</T>
    </Pressable>
  </View>;
}

export function NewTripScreen() {
  const c = useTheme();
  const scroll = useRef<ScrollView>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [t, setT] = useState({
    startDate: "", endDate: "", timezone: "", currency: "EUR", budget: "", pace: "BALANCED" as Pace, adults: 1, children: 0,
    accessibility: "", preferences: "", dietary: "", restaurantPrefs: "", notes: "",
    departureCity: "", arrivalLocation: "", arrivalAt: "", departureLocation: "", departureAt: "",
    isRoadTrip: false, carPickupLocation: "", carPickupAt: "", carReturnLocation: "", carReturnAt: "",
  });
  const [interests, setInterests] = useState<string[]>([]), [transport, setTransport] = useState<string[]>([]);
  const [dests, setDests] = useState<WizardDest[]>([emptyWizardDest()]);
  const [travelers, setTravelers] = useState<string[]>([]), [mustSee, setMustSee] = useState<string[]>([]), [optional, setOptional] = useState<string[]>([]);
  const [name, setName] = useState(""), [nameTouched, setNameTouched] = useState(false);
  const [staying, setStaying] = useState<number[]>([]);
  const set = <K extends keyof typeof t>(k: K, v: (typeof t)[K]) => setT(x => ({ ...x, [k]: v }));
  const setDest = (i: number, patch: Partial<WizardDest>) => setDests(ds => ds.map((d, j) => j === i ? { ...d, ...patch } : d));
  const current = WIZARD_STEPS[step];
  const named = dests.filter(d => d.name.trim());
  const multi = named.length > 1;
  const shownName = nameTouched ? name : suggestTripName(dests, t.startDate);
  const check = { dests, startDate: t.startDate, endDate: t.endDate, adults: t.adults, name: shownName };
  const filled: Record<string, boolean> = {
    style: interests.length > 0 || transport.length > 0 || t.pace !== "BALANCED",
    budget: Boolean(t.budget.trim()),
    getting: Boolean(t.departureCity || t.arrivalLocation || t.arrivalAt || t.departureLocation || t.departureAt || t.isRoadTrip || t.timezone || dests.some(d => d.accommodationName || d.accommodationAddress || d.neighborhood)),
    places: mustSee.length + optional.length > 0,
    food: Boolean(t.accessibility || t.dietary || t.restaurantPrefs || t.preferences || t.notes),
  };

  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  const go = (to: number) => { setError(null); setStep(Math.max(0, Math.min(WIZARD_STEPS.length - 1, to))); };
  const back = () => step > 0 ? go(step - 1) : router.canGoBack() ? router.back() : router.replace("/trips");

  function next() {
    const problem = wizardStepError(current.id, check);
    if (problem) { setError(problem); return; }
    if (current.id === "when" && multi) setDests(ds => splitStays(ds, t.startDate, t.endDate));
    if (current.id === "ready") { void create(); return; }
    go(step + 1);
  }

  async function create() {
    const problem = firstWizardProblem(check);
    if (problem) { setStep(problem.index); setError(problem.error); return; }
    setBusy(true); setError(null);
    try {
      const values = {
        ...t, name: shownName.trim(), timezone: t.timezone.trim() || null, interests, transport,
        destinations: named.map(d => ({ ...d, arriveDate: multi ? d.arriveDate : null, departDate: multi ? d.departDate : null })),
        travelers: travelers.map(n => ({ name: n, isChild: false })), mustSee, optional, commitments: [],
      };
      const r = await post<MobileCommandResult>("/api/mobile/workspace", { action: "trip.start", values });
      if (r.to) router.replace(workspaceHref(r.to)); else router.replace("/trips");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the trip. Please try again."); }
    finally { setBusy(false); }
  }

  return <View style={{ flex: 1, backgroundColor: c.bg }}>
    <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { gap: 18 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconButton name={step > 0 ? "chevron-back" : "close"} label={step > 0 ? "Back" : "Cancel"} onPress={back} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T style={{ fontFamily: "NunitoBold", fontSize: 12, color: c.accent, letterSpacing: 0.8 }}>STEP {step + 1} OF {WIZARD_STEPS.length}</T>
            {current.optional && <Muted style={{ fontSize: 12 }}>Optional</Muted>}
          </View>
          <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: WIZARD_STEPS.length, now: step + 1 }} style={{ flexDirection: "row", gap: 4 }}>
            {WIZARD_STEPS.map((s, i) => <View key={s.id} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? c.accent : c.line }} />)}
          </View>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <T accessibilityRole="header" style={{ fontFamily: "NunitoHeading", fontSize: 30, lineHeight: 36 }}>{current.title}</T>
        <Muted style={{ fontSize: 15, lineHeight: 21 }}>{current.hint}</Muted>
      </View>

      {current.id === "where" && <>
        {dests.map((d, i) => <Box key={i}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <View style={{ flex: 1 }}><Input label={dests.length > 1 ? `City ${i + 1}` : "City or region"} value={d.name} onChange={v => setDest(i, { name: v })} placeholder="e.g. Lisbon" autoCapitalize="words" /></View>
            {dests.length > 1 && <View style={{ flexDirection: "row", gap: 6, paddingBottom: 2 }}>
              <IconButton name="arrow-up" label={`Move ${d.name || "city"} up`} disabled={i === 0} onPress={() => setDests(ds => ds.map((x, j) => j === i - 1 ? ds[i] : j === i ? ds[i - 1] : x))} />
              <IconButton name="close" label={`Remove ${d.name || "city"}`} onPress={() => setDests(ds => ds.filter((_, j) => j !== i))} />
            </View>}
          </View>
          <Input label="Country (optional)" value={d.country} onChange={v => setDest(i, { country: v })} placeholder="e.g. Portugal" autoCapitalize="words" />
        </Box>)}
        <Button secondary leadingIcon="add" onPress={() => setDests(ds => [...ds, emptyWizardDest()])}>Add another city</Button>
        <Pressable accessibilityRole="link" onPress={() => router.push("/destinations")} style={{ paddingVertical: 4 }}>
          <T style={{ fontSize: 14, color: c.muted }}>Still deciding? <T style={{ fontSize: 14, color: c.accent, fontFamily: "NunitoBold", textDecorationLine: "underline" }}>Find a destination</T></T>
        </Pressable>
      </>}

      {current.id === "when" && <>
        <Box>
          <Fields fields={[dateField("startDate", "First day"), dateField("endDate", "Last day")]} values={{ startDate: t.startDate || null, endDate: t.endDate || null }} onChange={(v: MobileValues) => setT(x => ({ ...x, startDate: str(v.startDate), endDate: str(v.endDate) }))} />
        </Box>
        {t.startDate !== "" && <T accessibilityLiveRegion="polite" style={{ textAlign: "center", fontFamily: "NunitoHeading", fontSize: 18 }}>{dateRangeLabel(t.startDate, t.endDate)}</T>}
        {multi && t.startDate !== "" && t.endDate !== "" && <View style={{ gap: 10 }}>
          <T style={{ fontFamily: "NunitoBold", fontSize: 14 }}>Days in each city</T>
          {dests.map((d, i) => d.name.trim() ? <Box key={i}>
            <T style={{ fontFamily: "NunitoBold", fontSize: 16 }}>{d.name}</T>
            <Fields fields={[dateField("arriveDate", "Arrive"), dateField("departDate", "Leave")]} values={{ arriveDate: d.arriveDate || null, departDate: d.departDate || null }} onChange={v => setDest(i, { arriveDate: str(v.arriveDate), departDate: str(v.departDate) })} />
          </Box> : null)}
          <Button secondary onPress={() => setDests(ds => splitStays(ds.map(d => ({ ...d, arriveDate: "", departDate: "" })), t.startDate, t.endDate))}>Split the days evenly</Button>
          <Muted>On a moving day, use the same date to leave one city and arrive in the next.</Muted>
        </View>}
      </>}

      {current.id === "who" && <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {GROUPS.map(g => <Choice key={g.id} title={g.label} hint={peopleLabel(g.adults, g.children)} on={t.adults === g.adults && t.children === g.children} onPress={() => setT(x => ({ ...x, adults: g.adults, children: g.children }))} />)}
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Stepper label="Adults" value={t.adults} min={1} onChange={v => set("adults", v)} />
          <Stepper label="Children" value={t.children} min={0} onChange={v => set("children", v)} />
        </View>
        <ListEditor label="Names of the others (optional)" items={travelers} onChange={setTravelers} placeholder="e.g. Sam" />
        <Muted>You&apos;re added automatically.</Muted>
      </>}

      {current.id === "style" && <>
        <View style={{ gap: 8 }}>
          <T style={{ fontFamily: "NunitoBold", fontSize: 14 }}>Pace</T>
          <View style={{ gap: 10 }}>{PACES.map(p => <Choice key={p.id} title={p.label} hint={p.hint} on={t.pace === p.id} onPress={() => set("pace", p.id)} />)}</View>
        </View>
        <Chips label="What do you enjoy?" options={INTERESTS} value={interests} onChange={setInterests} />
        <Chips label="Getting around" options={TRANSPORT} value={transport} onChange={setTransport} />
      </>}

      {current.id === "budget" && <>
        <Input label="Budget for the whole group" value={t.budget} onChange={v => set("budget", v)} placeholder="e.g. 2500" keyboardType="decimal-pad" />
        <Fields fields={[{ key: "currency", label: "Currency", kind: "select", options: CURRENCIES.map(v => ({ value: v, label: v })) }]} values={{ currency: t.currency }} onChange={v => set("currency", str(v.currency) || "EUR")} />
      </>}

      {current.id === "getting" && <>
        <Input label="Departing from" value={t.departureCity} onChange={v => set("departureCity", v)} placeholder="e.g. London" autoCapitalize="words" />
        <Input label="Arriving at" value={t.arrivalLocation} onChange={v => set("arrivalLocation", v)} placeholder="e.g. LIS airport" />
        <DateTime label="Arrival date" value={t.arrivalAt} onChange={v => set("arrivalAt", v)} />
        <Input label="Leaving from" value={t.departureLocation} onChange={v => set("departureLocation", v)} placeholder="e.g. OPO airport" />
        <DateTime label="Departure date" value={t.departureAt} onChange={v => set("departureAt", v)} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
          <T style={{ flex: 1, fontFamily: "NunitoBold", fontSize: 14 }}>This is a road trip (rental or own car)</T>
          <Switch accessibilityLabel="This is a road trip" value={t.isRoadTrip} onValueChange={v => set("isRoadTrip", v)} trackColor={{ true: c.accent, false: c.line }} thumbColor="#ffffff" />
        </View>
        {t.isRoadTrip && <Box>
          <Input label="Car pickup place" value={t.carPickupLocation} onChange={v => set("carPickupLocation", v)} />
          <DateTime label="Pickup date" value={t.carPickupAt} onChange={v => set("carPickupAt", v)} />
          <Input label="Car return place" value={t.carReturnLocation} onChange={v => set("carReturnLocation", v)} />
          <DateTime label="Return date" value={t.carReturnAt} onChange={v => set("carReturnAt", v)} />
        </Box>}
        <Input label="Time zone (optional)" hint="Leave blank and it's detected from your first city." value={t.timezone} onChange={v => set("timezone", v)} placeholder="e.g. Europe/Lisbon" autoCapitalize="none" />
        {named.map(d => { const i = dests.indexOf(d); const open = staying.includes(i); return <Box key={i}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setStaying(s => open ? s.filter(x => x !== i) : [...s, i])} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32 }}>
            <T style={{ flex: 1, fontFamily: "NunitoBold", fontSize: 15 }}>Where you&apos;re staying in {d.name}</T>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={c.muted} />
          </Pressable>
          {open && <>
            <Input label="Hotel or place" value={d.accommodationName} onChange={v => setDest(i, { accommodationName: v })} />
            <Input label="Neighborhood" value={d.neighborhood} onChange={v => setDest(i, { neighborhood: v })} />
            <Input label="Address" value={d.accommodationAddress} onChange={v => setDest(i, { accommodationAddress: v })} />
            <Fields fields={[timeField("checkInTime", "Check-in time"), timeField("checkOutTime", "Check-out time")]} values={{ checkInTime: d.checkInTime, checkOutTime: d.checkOutTime }} onChange={v => setDest(i, { checkInTime: str(v.checkInTime), checkOutTime: str(v.checkOutTime) })} />
            {t.isRoadTrip && <Input label="Parking notes" value={d.parkingNotes} onChange={v => setDest(i, { parkingNotes: v })} />}
          </>}
        </Box>; })}
      </>}

      {current.id === "places" && <>
        <ListEditor label="Must-see places" items={mustSee} onChange={setMustSee} placeholder="e.g. Jerónimos Monastery" />
        <ListEditor label="Nice to have" items={optional} onChange={setOptional} placeholder="e.g. LX Factory" />
      </>}

      {current.id === "food" && <>
        <Input label="Dietary needs" value={t.dietary} onChange={v => set("dietary", v)} placeholder="e.g. vegetarian, nut allergy" />
        <Input label="Restaurant style" value={t.restaurantPrefs} onChange={v => set("restaurantPrefs", v)} placeholder="e.g. casual local places, one special dinner" />
        <Input label="Accessibility needs" multiline value={t.accessibility} onChange={v => set("accessibility", v)} placeholder="e.g. avoid long stairs, need step-free access" />
        <Input label="Anything else?" multiline value={t.preferences} onChange={v => set("preferences", v)} placeholder="e.g. early risers, no museums on sunny days" />
      </>}

      {current.id === "ready" && <>
        <Input label="Trip name" hint="Filled in for you. Change it if you like." value={shownName} onChange={v => { setNameTouched(true); setName(v); }} autoCapitalize="sentences" />
        <Box>
          <SummaryRow label="Where" value={named.map(d => d.name.trim()).join(" → ")} onEdit={() => go(0)} />
          <SummaryRow label="When" value={dateRangeLabel(t.startDate, t.endDate)} onEdit={() => go(1)} />
          <SummaryRow label="Who" value={peopleLabel(t.adults, t.children)} onEdit={() => go(2)} />
          <SummaryRow label="Style" value={[PACES.find(p => p.id === t.pace)?.label, ...interests].filter(Boolean).join(" · ")} onEdit={() => go(3)} />
          <SummaryRow label="Budget" value={t.budget.trim() ? `${t.budget.trim()} ${t.currency}` : ""} onEdit={() => go(4)} />
          <SummaryRow label="Getting there" value={filled.getting ? [t.departureCity && `From ${t.departureCity}`, t.isRoadTrip && "Road trip", dests.some(d => d.accommodationName) && "Stay added"].filter(Boolean).join(" · ") || "Added" : ""} onEdit={() => go(5)} />
          <SummaryRow label="Must-sees" value={[...mustSee, ...optional].join(", ")} onEdit={() => go(6)} />
          <SummaryRow label="Food & needs" value={[t.dietary, t.restaurantPrefs].filter(Boolean).join(" · ") || (filled.food ? "Added" : "")} onEdit={() => go(7)} />
        </Box>
        <Muted>Planning is free. Next come a few quick travel questions, then your first days are planned.</Muted>
      </>}

      {error && <ErrorNotice message={error} />}
    </ScrollView>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg, paddingHorizontal: 20, paddingVertical: 12 }}>
      {step > 0 ? <Button secondary compact leadingIcon="chevron-back" onPress={back} disabled={busy}>Back</Button> : null}
      <View style={{ flex: 1 }} />
      {current.optional && !filled[current.id] && <Button secondary compact onPress={() => go(step + 1)} disabled={busy}>Skip</Button>}
      <Button busy={busy} trailingIcon={current.id === "ready" ? "checkmark" : "arrow-forward"} onPress={next}>{current.id === "ready" ? "Create trip" : "Next"}</Button>
    </View>
  </View>;
}
