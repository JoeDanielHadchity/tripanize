import { useMemo, useRef, useState, type ReactNode } from "react";
import { PanResponder, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { dayLabel } from "../lib/data";
import type { MobileBlock, MobileItinerary, MobileTarget, MobileWorkspace } from "../lib/workspace";
import { ActionRow, ActionSheet, Chip, type RunAction } from "./trip-ui";
import { Badge, Button, Card, Heading, Icon, IconButton, Muted, Segmented, T, styles, type IconName } from "./ui";
import { useTheme } from "./theme";

type Meal = "breakfast" | "lunch" | "dinner";
const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];
const minutes = (value: number) => value >= 60 ? `${Math.floor(value / 60)} h${value % 60 ? ` ${value % 60} min` : ""}` : `${value} min`;
const words = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/^./, first => first.toUpperCase());
const CATEGORY_ICONS: Record<string, IconName> = { sight: "camera-outline", museum: "business-outline", food: "restaurant-outline", restaurant: "restaurant-outline", cafe: "cafe-outline", nature: "leaf-outline", park: "leaf-outline", beach: "sunny-outline", shopping: "bag-outline", nightlife: "wine-outline", transport: "train-outline", travel: "car-outline", hotel: "bed-outline", event: "musical-notes-outline", activity: "walk-outline" };

function DayStrip({ itinerary, tripId, onAction, selectedId }: { itinerary: MobileItinerary; tripId: string; onAction: RunAction; selectedId?: string }) {
  const c = useTheme(), list = useRef<ScrollView>(null);
  return <ScrollView ref={list} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 2 }}>
    {itinerary.days.map((day, index) => {
      const selected = day.id === (selectedId ?? itinerary.selectedDay?.id);
      return <Pressable key={day.id} accessibilityRole="tab" accessibilityLabel={`Day ${index + 1}, ${dayLabel(day.date, { weekday: "long", month: "long", day: "numeric" })}, ${day.stops} stops`} accessibilityState={{ selected }} onPress={() => { if (!selected) onAction({ label: "Choose day", to: { screen: "itinerary", tripId, item: day.id } }); }} onLayout={event => { if (selected) list.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - 40), animated: false }); }} style={({ pressed }) => ({ width: 68, paddingVertical: 10, borderRadius: 18, alignItems: "center", gap: 1, backgroundColor: selected ? c.accent : c.paper, borderWidth: selected ? 0 : StyleSheet.hairlineWidth, borderColor: c.line, opacity: pressed ? 0.7 : 1 })}>
        <T style={{ fontSize: 10, lineHeight: 14, letterSpacing: 0.8, fontFamily: "InterSemibold", color: selected ? c.accentText : c.muted }}>{dayLabel(day.date, { weekday: "short" }).toUpperCase()}</T>
        <T style={{ fontSize: 21, lineHeight: 27, fontFamily: "InterSemibold", color: selected ? c.accentText : c.ink }}>{dayLabel(day.date, { day: "numeric" })}</T>
        <View style={{ flexDirection: "row", gap: 3, height: 6, alignItems: "center" }}>{day.travel ? <Icon name="car" size={10} color={selected ? c.accentText : c.muted} /> : Array.from({ length: Math.min(4, day.stops) }, (_, i) => <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: selected ? c.accentText : c.accent, opacity: selected ? 0.85 : 0.6 }} />)}</View>
      </Pressable>;
    })}
  </ScrollView>;
}

function Checklist({ itinerary, onAction }: { itinerary: MobileItinerary; onAction: RunAction }) {
  const c = useTheme(); const [open, setOpen] = useState(false);
  const done = itinerary.checklist.filter(item => item.done).length, total = itinerary.checklist.length || 1;
  if (!itinerary.checklist.length) return null;
  return <Card style={{ padding: 14, gap: 10 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ gap: 9 }}>
    <View style={styles.row}><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="checkbox-outline" size={18} /><T style={{ fontFamily: "InterSemibold" }}>Trip checklist</T></View><View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Muted>{done}/{itinerary.checklist.length}</Muted><Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={c.muted} /></View></View>
    <View style={{ height: 6, borderRadius: 3, backgroundColor: c.soft, overflow: "hidden" }}><View style={{ width: `${Math.round(done / total * 100)}%`, height: 6, borderRadius: 3, backgroundColor: done === total ? c.success : c.accent }} /></View>
  </Pressable>
    {open && itinerary.checklist.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={`${item.label}, ${item.done ? "complete" : "needs attention"}`} onPress={() => onAction({ label: item.label, to: item.to })} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}><Icon name={item.done ? "checkmark-circle" : "ellipse-outline"} size={20} color={item.done ? c.success : c.muted} /><T style={{ flex: 1, color: item.done ? c.muted : c.ink }}>{item.label}</T><Icon name="chevron-forward" size={16} color={c.muted} /></Pressable>)}
  </Card>;
}

function StopCard({ block, onAction, busy, last }: { block: MobileBlock; onAction: RunAction; busy: boolean; last: boolean }) {
  const c = useTheme(); const [details, setDetails] = useState(false); const stop = block.stop!;
  const direct = block.actions?.filter(action => action.label === "Directions" || action.label === "Edit") ?? [];
  const more = block.actions?.filter(action => !direct.includes(action)) ?? [];
  const icon = CATEGORY_ICONS[stop.category?.toLowerCase()] ?? "location-outline";
  const suggested = stop.status === "SUGGESTED", confirmed = stop.status === "CONFIRMED";
  return <View style={{ flexDirection: "row", gap: 12 }}>
    <View style={{ width: 50, alignItems: "center" }}>
      <T style={{ fontFamily: "InterSemibold", fontSize: stop.time ? 14 : 11, lineHeight: 20, fontVariant: ["tabular-nums"], color: stop.time ? c.ink : c.muted }}>{stop.time ?? "Any time"}</T>
      <View style={{ width: 30, height: 30, borderRadius: 15, marginTop: 6, backgroundColor: confirmed ? c.accent : c.soft, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={15} color={confirmed ? c.accentText : c.accent} /></View>
      {!last && <View style={{ flex: 1, width: 2, borderRadius: 1, backgroundColor: c.line, marginTop: 6, minHeight: 24 }} />}
    </View>
    <View style={{ flex: 1, gap: 8, paddingBottom: last ? 0 : 14 }}>
      <Card style={{ padding: 15, gap: 8, ...(suggested ? { borderWidth: 1, borderStyle: "dashed", borderColor: c.accent, boxShadow: undefined } : {}) }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}><T style={{ flex: 1, fontSize: 16, lineHeight: 22, fontFamily: "InterSemibold" }}>{block.title}</T>{more.length > 0 && <ActionSheet iconOnly label="Stop options" actions={more} onAction={onAction} busy={busy} />}</View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{suggested && <Badge tone="accent" icon="bulb-outline">Suggestion</Badge>}{confirmed && <Badge tone="accent" icon="checkmark">Confirmed</Badge>}{stop.durationMin !== null && <Badge icon="time-outline">{minutes(stop.durationMin)}</Badge>}{stop.category && <Badge>{words(stop.category)}</Badge>}</View>
        {stop.place && <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}><Icon name="location-outline" size={14} color={c.muted} /><Muted style={{ flex: 1 }}>{stop.place}</Muted></View>}
        {block.text && <T numberOfLines={details ? undefined : 2} style={{ color: c.muted, fontSize: 14, lineHeight: 21 }}>{block.text}</T>}
        {details && <View style={{ gap: 6, backgroundColor: c.bg, borderRadius: 12, padding: 12 }}>{block.meta && <Muted>{block.meta}</Muted>}{block.lines?.map((line, i) => <T selectable key={i} style={{ fontSize: 13, lineHeight: 20 }}>{line}</T>)}</View>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <ActionRow actions={direct} onAction={onAction} busy={busy} />
          {(block.lines?.length || block.meta || block.text) ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6 }}><T style={{ fontSize: 13, color: c.accent, fontFamily: "InterSemibold" }}>{details ? "Less" : "Details"}</T><Icon name={details ? "chevron-up" : "chevron-down"} size={14} /></Pressable> : null}
        </View>
      </Card>
      {!last && stop.travelToNextMin !== null && stop.travelToNextMin > 0 && <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 4 }}><Icon name={stop.travelMode?.toLowerCase().includes("walk") ? "walk-outline" : "navigate-outline"} size={13} color={c.muted} /><Muted style={{ fontSize: 12 }}>~{minutes(stop.travelToNextMin)} to the next stop</Muted></View>}
    </View>
  </View>;
}

function RestaurantChoices({ blocks, preferences, onAction, busy }: { blocks: MobileBlock[]; preferences?: MobileTarget; onAction: RunAction; busy: boolean }) {
  const c = useTheme(); const [meal, setMeal] = useState<Meal>(MEALS.find(value => blocks.some(block => block.restaurant?.meal === value)) ?? "breakfast");
  const choices = blocks.filter(block => block.restaurant?.meal === meal);
  return <View style={{ gap: 12 }}>
    <View style={[styles.row, { paddingHorizontal: 4 }]}><T accessibilityRole="header" style={{ fontFamily: "InterSemibold", fontSize: 17 }}>Where to eat</T>{preferences && <Pressable accessibilityRole="button" onPress={() => onAction({ label: "Food preferences", to: preferences })} style={{ minHeight: 40, justifyContent: "center" }}><T style={{ color: c.accent, fontSize: 13, fontFamily: "InterSemibold" }}>Food preferences</T></Pressable>}</View>
    <Segmented label="Choose a meal" value={meal} onChange={setMeal} options={MEALS.map(value => ({ value, label: words(value) }))} />
    {!choices.length && <Muted>No saved options for this meal yet.</Muted>}
    {choices.map(block => <Card key={block.id} style={{ padding: 15, gap: 7 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}><View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.coralSoft, alignItems: "center", justifyContent: "center" }}><Icon name="restaurant" size={18} color={c.coral} /></View><View style={{ flex: 1 }}><T style={{ fontFamily: "InterSemibold", fontSize: 16, lineHeight: 22 }}>{block.restaurant!.name}</T><Muted>{[block.restaurant!.cuisine, block.restaurant!.area].filter(Boolean).join(" · ")}</Muted></View><Badge>{`Option ${block.restaurant!.option}`}</Badge></View>
      {block.text && <T style={{ fontSize: 14, lineHeight: 21, color: c.muted }}>{block.text}</T>}{block.restaurant!.hoursNote && <Muted>{block.restaurant!.hoursNote}</Muted>}<ActionRow actions={block.actions ?? []} busy={busy} onAction={onAction} />
    </Card>)}
    <Muted style={{ paddingHorizontal: 4 }}>Check opening hours and dietary needs with the restaurant.</Muted>
  </View>;
}

/** Horizontal swipes on the day content move between days. */
function useDaySwipe(move: (delta: number) => void, canPrev: boolean, canNext: boolean) {
  return useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_, g) => { if (g.dx < -70 && canNext) move(1); else if (g.dx > 70 && canPrev) move(-1); },
  }), [move, canPrev, canNext]);
}

export function NativeItinerary({ data, onAction, busy, renderBlock, pendingDay }: { data: MobileWorkspace; onAction: RunAction; busy: boolean; renderBlock: (block: MobileBlock) => ReactNode; pendingDay?: string }) {
  const c = useTheme(); const [search, setSearch] = useState(""); const [searching, setSearching] = useState(false); const [notesOpen, setNotesOpen] = useState(false);
  const itinerary = data.itinerary!, day = itinerary.selectedDay!, tripId = data.tripId!;
  const index = itinerary.days.findIndex(value => value.id === day.id);
  const tools = data.blocks.find(block => block.id === "tools")?.actions ?? [];
  const plan = tools.find(action => action.to?.screen === "plan"), pdf = tools.find(action => action.device === "file");
  const otherTools = tools.filter(action => action !== plan && action !== pdf && action.to?.screen !== "assistant");
  const dayBlock = data.blocks.find(block => block.id === "day");
  const planB = data.blocks.find(block => block.id === "plan-b-note");
  const needle = search.toLowerCase().trim();
  const matches = (block: MobileBlock) => !needle || [block.title, block.meta, block.text, block.stop?.place, block.stop?.category, ...(block.lines ?? [])].filter(Boolean).join(" ").toLowerCase().includes(needle);
  const stops = data.blocks.filter(block => block.stop && matches(block));
  const restaurants = data.blocks.filter(block => block.restaurant && matches(block));
  const extras = data.blocks.filter(block => !block.stop && !block.restaurant && !["cover", "tools", "days", "day", "plan-b-note"].includes(block.id) && matches(block));
  const dayActions = dayBlock?.actions?.filter(action => action.action !== "day.plan") ?? [];
  const addStop = dayActions.find(action => action.to?.screen === "stop");
  const move = (delta: number) => { if (!busy && itinerary.days[index + delta]) onAction({ label: "Choose day", to: { screen: "itinerary", tripId, item: itinerary.days[index + delta].id } }); };
  const swipe = useDaySwipe(move, index > 0, index < itinerary.days.length - 1);
  const prev = itinerary.days[index - 1], next = itinerary.days[index + 1];
  return <View style={{ gap: 18 }}>
    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
      {plan && <Button compact leadingIcon="sparkles" tone="coral" disabled={busy} onPress={() => onAction(plan)}>Plan with AI</Button>}
      <View style={{ flex: 1 }} />
      {addStop && <IconButton name="add" label="Add stop" size={40} disabled={busy} onPress={() => onAction(addStop)} />}
      <IconButton name={searching ? "close" : "search"} label={searching ? "Close search" : "Search this day"} size={40} onPress={() => { setSearching(!searching); if (searching) setSearch(""); }} />
      {pdf && <IconButton name="download-outline" label="Download trip PDF" size={40} disabled={busy} onPress={() => onAction(pdf)} />}
      <ActionSheet iconOnly icon="ellipsis-horizontal" label="Trip tools" actions={otherTools} onAction={onAction} busy={busy} />
    </View>
    {searching && <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, backgroundColor: c.paper, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line }}><Icon name="search" size={18} color={c.muted} /><TextInput autoFocus accessibilityLabel="Search this day's stops and restaurants" placeholder="Search stops, places, restaurants…" placeholderTextColor={c.muted} value={search} onChangeText={setSearch} style={{ flex: 1, minHeight: 48, color: c.ink, fontFamily: "Inter", fontSize: 15 }} /></View>}
    <Checklist itinerary={itinerary} onAction={onAction} />
    <DayStrip itinerary={itinerary} tripId={tripId} onAction={onAction} selectedId={pendingDay} />
    <View {...swipe.panHandlers} style={{ gap: 16 }}>
      <View style={{ gap: 8, paddingHorizontal: 4 }}>
        <View style={styles.row}><T style={{ color: c.coral, fontSize: 12, fontFamily: "InterSemibold", letterSpacing: 1.2, textTransform: "uppercase" }}>Day {index + 1} · {dayLabel(day.date, { weekday: "long", day: "numeric", month: "long" })}</T>{dayActions.length > 0 && <ActionSheet iconOnly icon="options-outline" label="Day options" actions={dayActions} busy={busy} onAction={onAction} />}</View>
        <T accessibilityRole="header" style={{ fontFamily: "Fraunces", fontSize: 26, lineHeight: 32, letterSpacing: -0.5 }}>{day.title}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{day.area && <Badge icon="location-outline">{day.area}</Badge>}{itinerary.days[index]?.travel && <Badge icon="car-outline">{`Travel day${day.travelMinutes !== undefined ? ` · ~${minutes(day.travelMinutes)}` : ""}`}</Badge>}{day.estimatedCost && <Badge icon="wallet-outline">{`${day.estimatedCost} est.`}</Badge>}</View>
        {day.planActions.length > 1 ? <Segmented label="Day plan" value={day.activePlan} onChange={value => { const action = day.planActions.find(a => a.values?.plan === value); if (action && value !== day.activePlan && !busy) onAction(action); }} options={day.planActions.map(a => ({ value: (a.values?.plan as "A" | "B") ?? "A", label: a.label }))} /> : <Chip accent>{`Plan ${day.activePlan}`}</Chip>}
        {(dayBlock?.text || planB?.text) && <View style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: notesOpen }} onPress={() => setNotesOpen(!notesOpen)} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 }}><Icon name="reader-outline" size={16} /><T style={{ fontSize: 14, color: c.accent, fontFamily: "InterSemibold" }}>Day notes & advice</T><Icon name={notesOpen ? "chevron-up" : "chevron-down"} size={14} /></Pressable>{notesOpen && <Card style={{ backgroundColor: c.bg, gap: 8 }}>{dayBlock?.text && <T selectable>{dayBlock.text}</T>}{planB?.text && <><T style={{ fontFamily: "InterSemibold" }}>Plan B</T><T selectable>{planB.text}</T></>}</Card>}</View>}
      </View>
      <View>{stops.map((block, i) => <StopCard key={block.id} block={block} onAction={onAction} busy={busy} last={i === stops.length - 1} />)}</View>
      {!stops.length && <Card style={{ alignItems: "center", paddingVertical: 26 }}><Icon name={needle ? "search" : "sunny-outline"} size={28} /><Heading small>{needle ? "No matching stops" : "Your day is open"}</Heading>{addStop && !needle && <Button compact leadingIcon="add" onPress={() => onAction(addStop)}>Add your first stop</Button>}</Card>}
    </View>
    {(restaurants.length > 0 || !needle) && <RestaurantChoices key={day.id} blocks={restaurants} preferences={plan?.to} onAction={onAction} busy={busy} />}
    {extras.length > 0 && <View style={{ gap: 12 }}><T accessibilityRole="header" style={{ fontFamily: "InterSemibold", fontSize: 17, paddingHorizontal: 4 }}>Ideas & skipped stops</T>{extras.map(renderBlock)}</View>}
    <View style={[styles.row, { gap: 10 }]}>
      <Button compact secondary leadingIcon="chevron-back" disabled={!prev || busy} style={{ flex: 1 }} onPress={() => move(-1)}>{prev ? `Day ${index}` : "First day"}</Button>
      <Button compact secondary trailingIcon="chevron-forward" disabled={!next || busy} style={{ flex: 1 }} onPress={() => move(1)}>{next ? `Day ${index + 2}` : "Last day"}</Button>
    </View>
    <Muted style={{ textAlign: "center" }}>Swipe left or right to change days · local times · estimates</Muted>
  </View>;
}
