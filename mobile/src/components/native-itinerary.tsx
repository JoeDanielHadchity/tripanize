import { useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { dayLabel } from "../lib/data";
import type { MobileBlock, MobileItinerary, MobileTarget, MobileWorkspace } from "../lib/workspace";
import { ActionRow, ActionSheet, Chip, type RunAction } from "./trip-ui";
import { Button, Card, Heading, Icon, Muted, T, styles } from "./ui";
import { useTheme } from "./theme";

type Meal = "breakfast" | "lunch" | "dinner";
const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];
const minutes = (value: number) => value >= 60 ? `${Math.floor(value / 60)} h${value % 60 ? ` ${value % 60} min` : ""}` : `${value} min`;
const words = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/^./, first => first.toUpperCase());

function DayChoices({ itinerary, tripId, onAction }: { itinerary: MobileItinerary; tripId: string; onAction: RunAction }) {
  const c = useTheme(), list = useRef<ScrollView>(null);
  return <ScrollView ref={list} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 10, paddingBottom: 3 }}>
    {itinerary.days.map((day, index) => {
      const selected = day.id === itinerary.selectedDay?.id;
      return <Pressable key={day.id} accessibilityRole="tab" accessibilityLabel={`Day ${index + 1}, ${dayLabel(day.date, { weekday: "long", month: "long", day: "numeric" })}, ${day.stops} stops`} accessibilityState={{ selected }} onPress={() => { if (!selected) onAction({ label: "Choose day", to: { screen: "itinerary", tripId, item: day.id } }); }} onLayout={event => { if (selected) list.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - 12), animated: false }); }} style={{ minWidth: 148, minHeight: 94, padding: 15, gap: 3, borderWidth: 1, borderColor: selected ? c.accent : c.line, borderRadius: 12, backgroundColor: selected ? c.accent : c.paper }}>
        <T style={{ fontSize: 11, lineHeight: 17, letterSpacing: 0.7, color: selected ? c.accentText : c.muted }}>DAY {index + 1}</T>
        <T style={{ fontSize: 17, lineHeight: 25, fontFamily: "InterSemibold", color: selected ? c.accentText : c.ink }}>{dayLabel(day.date, { weekday: "short", month: "short", day: "numeric" })}</T>
        <T style={{ fontSize: 12, lineHeight: 18, color: selected ? c.accentText : c.muted }}>{day.stops} {day.stops === 1 ? "stop" : "stops"}{day.travel ? " · travel" : ""}</T>
      </Pressable>;
    })}
  </ScrollView>;
}

function Checklist({ itinerary, onAction }: { itinerary: MobileItinerary; onAction: RunAction }) {
  const c = useTheme(); const [open, setOpen] = useState(false);
  return <Card style={{ padding: 15 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 36, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}><Icon name={open ? "chevron-down" : "chevron-forward"} size={16} /><T style={{ fontFamily: "InterSemibold" }}>Trip checklist</T><Muted>{itinerary.checklist.filter(item => item.done).length} of {itinerary.checklist.length} complete</Muted></Pressable>
    {open && itinerary.checklist.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={`${item.label}, ${item.done ? "complete" : "needs attention"}`} onPress={() => onAction({ label: item.label, to: item.to })} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, borderTopWidth: 1, borderTopColor: c.line }}><Icon name={item.done ? "checkmark-circle" : "ellipse-outline"} size={20} /><T style={{ flex: 1 }}>{item.label}</T><Icon name="chevron-forward" size={16} /></Pressable>)}
  </Card>;
}

function DayPager({ index, total, busy, move }: { index: number; total: number; busy: boolean; move: (delta: number) => void }) {
  const c = useTheme();
  return <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="Previous day" accessibilityState={{ disabled: index === 0 || busy }} disabled={index === 0 || busy} onPress={() => move(-1)} style={{ minWidth: 48, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.paper, opacity: index === 0 ? 0.4 : 1 }}><Icon name="arrow-back" size={20} /></Pressable><Muted>Day {index + 1} of {total}</Muted><Pressable accessibilityRole="button" accessibilityLabel="Next day" accessibilityState={{ disabled: index === total - 1 || busy }} disabled={index === total - 1 || busy} onPress={() => move(1)} style={{ minWidth: 48, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.paper, opacity: index === total - 1 ? 0.4 : 1 }}><Icon name="arrow-forward" size={20} /></Pressable></View>;
}

function StopCard({ block, onAction, busy, last }: { block: MobileBlock; onAction: RunAction; busy: boolean; last: boolean }) {
  const c = useTheme(); const [details, setDetails] = useState(false); const stop = block.stop!;
  const direct = block.actions?.filter(action => action.label === "Directions" || action.label === "Edit") ?? [];
  const more = block.actions?.filter(action => !direct.includes(action)) ?? [];
  return <View style={{ gap: 9 }}><Card style={{ padding: 15 }}><View style={{ flexDirection: "row", gap: 13 }}>
    <View style={{ width: 62, flexShrink: 0, alignItems: "center", gap: 2 }}><T style={{ fontFamily: "InterSemibold", fontSize: stop.time ? 16 : 12, lineHeight: 25, fontVariant: ["tabular-nums"] }}>{stop.time ?? "Anytime"}</T>{stop.durationMin !== null && <T style={{ color: c.muted, fontSize: 12, lineHeight: 18, textAlign: "center" }}>{minutes(stop.durationMin)}</T>}<View style={{ flex: 1, minHeight: 20, borderLeftWidth: 1, borderColor: c.line, marginTop: 6 }} /></View>
    <View style={{ flex: 1, gap: 9 }}><T style={{ fontSize: 17, lineHeight: 24, fontFamily: "InterSemibold" }}>{block.title}</T><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}><Chip accent>{stop.status === "SUGGESTED" ? "Suggestion" : words(stop.status)}</Chip>{stop.category && <Chip>{words(stop.category)}</Chip>}</View>
      {stop.place && <Muted>{stop.place}</Muted>}{block.text && <T numberOfLines={details ? undefined : 2} style={{ color: c.muted, fontSize: 14, lineHeight: 22 }}>{block.text}</T>}
      {(block.lines?.length || block.meta || block.text) ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 5 }}><Icon name={details ? "chevron-down" : "chevron-forward"} size={15} /><T style={{ fontSize: 13, color: c.accent }}>Details & advice</T></Pressable> : null}
      {details && <View style={{ gap: 7 }}>{block.meta && <Muted>{block.meta}</Muted>}{block.lines?.map((line, i) => <T selectable key={i} style={{ fontSize: 13, lineHeight: 21 }}>{line}</T>)}</View>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}><ActionRow actions={direct} onAction={onAction} busy={busy} />{more.length > 0 && <ActionSheet label="More" actions={more} onAction={onAction} busy={busy} />}</View>
    </View>
  </View></Card>{!last && stop.travelToNextMin !== null && stop.travelToNextMin > 0 && <View style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 22 }}><Icon name={stop.travelMode?.toLowerCase().includes("walk") ? "walk-outline" : "navigate-outline"} size={14} /><Muted>{minutes(stop.travelToNextMin)} to next stop · estimate</Muted></View>}</View>;
}

function RestaurantChoices({ blocks, preferences, onAction, busy }: { blocks: MobileBlock[]; preferences?: MobileTarget; onAction: RunAction; busy: boolean }) {
  const c = useTheme(); const [meal, setMeal] = useState<Meal>(MEALS.find(value => blocks.some(block => block.restaurant?.meal === value)) ?? "breakfast");
  const choices = blocks.filter(block => block.restaurant?.meal === meal);
  return <Card style={{ padding: 16, gap: 15 }}><View style={{ gap: 5 }}><Heading small>Restaurant options</Heading>{preferences && <Pressable accessibilityRole="button" onPress={() => onAction({ label: "Food preferences", to: preferences })} style={{ minHeight: 40, justifyContent: "center" }}><T style={{ color: c.accent, fontSize: 13, textDecorationLine: "underline" }}>Food preferences</T></Pressable>}</View>
    <View accessibilityRole="tablist" accessibilityLabel="Choose a meal" style={{ flexDirection: "row", gap: 5 }}>{MEALS.map(value => <Button key={value} compact secondary={meal !== value} style={{ flex: 1, paddingHorizontal: 5 }} onPress={() => setMeal(value)}>{words(value)}</Button>)}</View>
    {!choices.length && <Muted>No saved options for this meal yet.</Muted>}
    {choices.map(block => <Card key={block.id} style={{ padding: 15, gap: 8 }}><Muted>Option {block.restaurant!.option}</Muted><T style={{ fontFamily: "InterSemibold", fontSize: 18, lineHeight: 25 }}>{block.restaurant!.name}</T><Muted>{[block.restaurant!.cuisine, block.restaurant!.area].filter(Boolean).join(" · ")}</Muted>{block.text && <T style={{ fontSize: 14, lineHeight: 22 }}>{block.text}</T>}{block.restaurant!.hoursNote && <Muted>{block.restaurant!.hoursNote}</Muted>}<ActionRow actions={block.actions ?? []} busy={busy} onAction={onAction} /></Card>)}
    <Muted>Check opening hours and dietary needs with the restaurant.</Muted>
  </Card>;
}

export function NativeItinerary({ data, onAction, busy, renderBlock }: { data: MobileWorkspace; onAction: RunAction; busy: boolean; renderBlock: (block: MobileBlock) => ReactNode }) {
  const c = useTheme(); const [search, setSearch] = useState(""); const [notesOpen, setNotesOpen] = useState(false);
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
  const move = (delta: number) => onAction({ label: "Choose day", to: { screen: "itinerary", tripId, item: itinerary.days[index + delta].id } });
  return <View style={{ gap: 19 }}>
    <Muted>{itinerary.days.length} days · local times · estimated costs and travel times</Muted>
    <ActionRow actions={[...(plan ? [plan] : []), ...(pdf ? [{ ...pdf, label: "Trip PDF" }] : [])]} onAction={onAction} busy={busy} primary={!!plan} />
    <Checklist itinerary={itinerary} onAction={onAction} />
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: c.line, borderRadius: 11, backgroundColor: c.paper, paddingHorizontal: 13 }}><Icon name="search-outline" size={18} /><TextInput accessibilityLabel="Search this day's stops and restaurants" placeholder="Search stops, places, restaurants…" placeholderTextColor={c.muted} value={search} onChangeText={setSearch} style={{ flex: 1, minHeight: 48, color: c.ink, fontFamily: "Inter", fontSize: 14 }} /></View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{addStop && <Button compact secondary leadingIcon="add" disabled={busy} onPress={() => onAction(addStop)}>Add stop</Button>}<ActionSheet label="Trip tools" actions={otherTools} onAction={onAction} busy={busy} /></View>
    <DayChoices itinerary={itinerary} tripId={tripId} onAction={onAction} />
    <DayPager index={index} total={itinerary.days.length} busy={busy} move={move} />
    <Card style={{ backgroundColor: c.bg, gap: 13 }}><T style={{ color: c.accent, fontSize: 13 }}>{dayLabel(day.date, { weekday: "long", day: "numeric", month: "long" })}</T><T accessibilityRole="header" style={{ fontFamily: "Fraunces", fontSize: 25, lineHeight: 32 }}>{day.title}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>{day.area && <Chip>{day.area}</Chip>}{itinerary.days[index]?.travel && <Chip>Travel day{day.travelMinutes !== undefined ? ` · ~${minutes(day.travelMinutes)} driving` : ""}</Chip>}{day.estimatedCost && <Chip>{day.estimatedCost} planned · estimate</Chip>}</View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>{day.planActions.length ? <View accessibilityRole="tablist" accessibilityLabel="Day plan" style={{ flexDirection: "row", gap: 4 }}>{day.planActions.map(action => <Button key={action.label} compact secondary={action.values?.plan !== day.activePlan} disabled={busy} onPress={() => { if (action.values?.plan !== day.activePlan) onAction(action); }}>{action.label}</Button>)}</View> : <Chip accent>Plan {day.activePlan}</Chip>}{dayActions.length > 0 && <ActionSheet label="Day options" actions={dayActions} busy={busy} onAction={onAction} />}</View>
      {(dayBlock?.text || planB?.text) && <View style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: notesOpen }} onPress={() => setNotesOpen(!notesOpen)} style={{ flexDirection: "row", alignItems: "center", gap: 5, minHeight: 40 }}><Icon name={notesOpen ? "chevron-down" : "chevron-forward"} size={15} /><T style={{ fontSize: 14, color: c.accent }}>Day notes & advice</T></Pressable>{notesOpen && <>{dayBlock?.text && <T selectable>{dayBlock.text}</T>}{planB?.text && <><T style={{ fontFamily: "InterSemibold" }}>Plan B</T><T selectable>{planB.text}</T></>}</>}</View>}
      {stops.map((block, i) => <StopCard key={block.id} block={block} onAction={onAction} busy={busy} last={i === stops.length - 1} />)}
      {!stops.length && <Card><T>{needle ? "No matching stops on this day." : "Your day is open."}</T>{addStop && !needle && <Button compact secondary onPress={() => onAction(addStop)}>Add your first stop</Button>}</Card>}
    </Card>
    {(restaurants.length > 0 || !needle) && <RestaurantChoices key={day.id} blocks={restaurants} preferences={plan?.to} onAction={onAction} busy={busy} />}
    {extras.length > 0 && <View style={{ gap: 12 }}><Heading small>Ideas & skipped stops</Heading>{extras.map(renderBlock)}</View>}
    <DayPager index={index} total={itinerary.days.length} busy={busy} move={move} />
  </View>;
}
