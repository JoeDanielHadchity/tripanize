import { useRef, useState } from "react";
import { Pressable, Switch, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Muted, T, styles } from "./ui";
import { Sheet } from "./trip-ui";
import { useTheme } from "./theme";
import { formDefaults, getValue, setValue, type MobileField, type MobileValue, type MobileValues } from "../lib/workspace";

/** Date fields shown together as one "from – to" calendar. */
const RANGES: [string, string][] = [["startDate", "endDate"], ["arriveDate", "departDate"], ["date", "endDate"]];

export function Fields({ fields, values, onChange, disabled = false }: { fields: MobileField[]; values: MobileValues; onChange: (v: MobileValues) => void; disabled?: boolean }) {
  const visible = fields.filter(f => f.kind !== "files");
  const out: React.ReactNode[] = [];
  for (let i = 0; i < visible.length; i++) {
    const field = visible[i];
    const pair = field.kind === "date" ? RANGES.find(([a]) => a === field.key) : undefined;
    const end = pair ? visible.find(f => f.key === pair[1] && f.kind === "date") : undefined;
    if (pair && end) {
      out.push(<DateRangeField key={field.key} start={field} end={end} values={values} onChange={onChange} disabled={disabled} />);
      continue;
    }
    if (RANGES.some(([a, b]) => b === field.key && visible.some(f => f.key === a && f.kind === "date")) && field.kind === "date") continue;
    out.push(<Field key={field.key} field={field} value={getValue(values, field.key)} onChange={value => onChange(setValue(values, field.key, value))} disabled={disabled} />);
  }
  return <>{out}</>;
}

function Label({ f }: { f: MobileField }) { return <T style={{ fontFamily: "InterSemibold", fontSize: 14 }}>{f.label}{f.required ? " *" : ""}</T>; }

function Field({ field: f, value, onChange, disabled }: { field: MobileField; value: MobileValue | undefined; onChange: (v: MobileValue) => void; disabled: boolean }) {
  const c = useTheme(); const [expanded, setExpanded] = useState(false);
  const label = <Label f={f} />;
  if (f.kind === "check") return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>{label}<Switch accessibilityLabel={f.label} disabled={disabled} value={value === true} onValueChange={onChange} trackColor={{ true: c.accent, false: c.line }} thumbColor="#ffffff" /></View>;
  if (f.kind === "date") return <DateField f={f} value={typeof value === "string" ? value : ""} onChange={onChange} disabled={disabled} />;
  if (f.kind === "list") return <ListField f={f} value={value} onChange={onChange} disabled={disabled} />;
  if (f.kind === "repeat") {
    const rows = Array.isArray(value) ? value : [];
    return <View style={{ gap: 12 }}>{label}{rows.map((row, i) => <Card key={i} style={{ gap: 12, padding: 14 }}><Fields fields={f.fields ?? []} values={row && typeof row === "object" && !Array.isArray(row) ? row : {}} onChange={v => onChange(rows.map((old, at) => at === i ? v : old))} disabled={disabled} /><Button secondary disabled={disabled} onPress={() => onChange(rows.filter((_, at) => at !== i))}>Remove {f.label.toLowerCase()} {i + 1}</Button></Card>)}{rows.length < (f.max ?? 30) && <Button secondary disabled={disabled} onPress={() => onChange([...rows, formDefaults(f.fields ?? [])])}>Add {f.label.toLowerCase()}</Button>}{f.hint && <Muted>{f.hint}</Muted>}</View>;
  }
  if (f.kind === "select" || f.kind === "multi") {
    const multiple = f.kind === "multi", selected = multiple ? Array.isArray(value) ? value : [] : [value];
    const choices = f.options ?? [], visible = !expanded && choices.length > 8 ? choices.filter((o, i) => i < 6 || selected.includes(o.value)) : choices;
    return <View style={{ gap: 10 }}>{label}<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{visible.map(option => {
      const chosen = selected.includes(option.value) || (option.value === "" && value === null);
      return <Pressable key={option.value} accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityLabel={option.label} accessibilityState={{ checked: chosen, disabled }} disabled={disabled} onPress={() => onChange(multiple ? chosen ? selected.filter(v => v !== option.value) as MobileValue[] : f.max === 1 ? [option.value] : [...selected, option.value].filter((v): v is MobileValue => v !== undefined) : option.value)} style={{ borderWidth: 1, borderColor: chosen ? c.accent : c.line, backgroundColor: chosen ? c.accent : c.paper, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 15, minHeight: 42, justifyContent: "center" }}><T style={{ fontSize: 13, fontFamily: chosen ? "InterSemibold" : "Inter", color: chosen ? c.accentText : c.ink }}>{multiple && chosen ? "✓ " : ""}{option.label}</T></Pressable>;
    })}</View>{choices.length > 8 && <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)}><T style={{ color: c.accent, paddingVertical: 8 }}>{expanded ? "Fewer choices" : "All choices"}</T></Pressable>}{f.hint && <Muted>{f.hint}</Muted>}</View>;
  }
  const string = Array.isArray(value) ? value.join("\n") : value === null || value === undefined ? "" : String(value);
  return <View style={{ gap: 8 }}>{label}<TextInput accessibilityLabel={f.label} editable={!disabled} placeholder={f.kind === "time" ? "HH:MM" : undefined} placeholderTextColor={c.muted} value={string} onChangeText={text => onChange(f.kind === "number" ? text === "" ? null : Number.isFinite(Number(text)) ? Number(text) : text : text)} multiline={f.kind === "long"} keyboardType={f.kind === "money" || f.kind === "number" ? "decimal-pad" : f.kind === "time" ? "numbers-and-punctuation" : f.key.toLowerCase().includes("email") ? "email-address" : "default"} autoCapitalize={/currency/i.test(f.key) ? "characters" : /url|email|timezone|startsAt|endsAt/i.test(f.key) ? "none" : "sentences"} autoCorrect={!/url|email|timezone/i.test(f.key)} style={inputStyle(c, f.kind === "long")} />{f.hint && <Muted>{f.hint}</Muted>}</View>;
}

const inputStyle = (c: ReturnType<typeof useTheme>, tall = false) => ({ backgroundColor: c.bg, color: c.ink, fontFamily: "Inter", borderWidth: 1, borderColor: c.line, borderRadius: 14, fontSize: 16, paddingHorizontal: 15, paddingVertical: 13, minHeight: tall ? 90 : 48, textAlignVertical: "top" as const });

/** One input per entry. Enter adds the next entry and moves to it. */
function ListField({ f, value, onChange, disabled }: { f: MobileField; value: MobileValue | undefined; onChange: (v: MobileValue) => void; disabled: boolean }) {
  const c = useTheme(); const inputs = useRef<(TextInput | null)[]>([]);
  const items = Array.isArray(value) && value.length ? value.map(v => String(v ?? "")) : [""];
  const max = f.key === "options" ? 8 : (f.max ?? 50);
  const noun = f.key === "options" ? "Option" : "Item";
  const set = (next: string[]) => onChange(next);
  const add = (after: number) => {
    if (items.length >= max) return;
    set([...items.slice(0, after + 1), "", ...items.slice(after + 1)]);
    setTimeout(() => inputs.current[after + 1]?.focus(), 60);
  };
  return <View style={{ gap: 8 }}><Label f={f} />
    {items.map((item, i) => <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.soft, alignItems: "center", justifyContent: "center" }}><T style={{ fontSize: 12, fontFamily: "InterSemibold", color: c.accent }}>{i + 1}</T></View>
      <TextInput ref={el => { inputs.current[i] = el; }} accessibilityLabel={`${noun} ${i + 1}`} editable={!disabled} placeholder={`${noun} ${i + 1}`} placeholderTextColor={c.muted} value={item} returnKeyType={i === items.length - 1 && items.length < max ? "next" : "done"} submitBehavior="submit" onSubmitEditing={() => { if (item.trim()) add(i); }}
        onChangeText={text => set(items.map((old, at) => at === i ? text : old))} style={[inputStyle(c), { flex: 1 }]} />
      {items.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${noun.toLowerCase()} ${i + 1}`} disabled={disabled} onPress={() => set(items.filter((_, at) => at !== i))} hitSlop={8}><Ionicons name="close-circle" size={22} color={c.muted} /></Pressable>}
    </View>)}
    {items.length < max && <Pressable accessibilityRole="button" disabled={disabled} onPress={() => add(items.length - 1)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}><Ionicons name="add-circle-outline" size={20} color={c.accent} /><T style={{ color: c.accent, fontFamily: "InterSemibold" }}>Add {noun.toLowerCase()}</T></Pressable>}
    <Muted>{f.key === "options" ? "Press Enter after each option to add the next one (2–8 options)." : f.hint ?? "Press Enter to add another."}</Muted>
  </View>;
}

// ───────────────────────── Calendar ─────────────────────────

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s?: string | null) => s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : null;
const pretty = (s?: string | null) => { const d = parse(s); return d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : ""; };
const compact = (s?: string | null) => { const d = parse(s); return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""; };
const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function Calendar({ start, end, onPick }: { start: string | null; end: string | null; onPick: (date: string) => void }) {
  const c = useTheme();
  const first = parse(start) ?? new Date();
  const [month, setMonth] = useState(new Date(first.getFullYear(), first.getMonth(), 1));
  const lead = (month.getDay() + 6) % 7, days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  while (cells.length % 7) cells.push(null);
  const today = iso(new Date());
  const move = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return <View style={{ gap: 10 }}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => move(-1)} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}><Ionicons name="chevron-back" size={20} color={c.ink} /></Pressable>
      <T style={{ fontFamily: "InterSemibold", fontSize: 16 }}>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</T>
      <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => move(1)} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}><Ionicons name="chevron-forward" size={20} color={c.ink} /></Pressable>
    </View>
    <View style={{ flexDirection: "row" }}>{WEEK.map(w => <T key={w} style={{ flex: 1, textAlign: "center", fontSize: 12, color: c.muted, fontFamily: "InterSemibold" }}>{w}</T>)}</View>
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{cells.map((d, i) => {
      const isStart = d !== null && d === start, isEnd = d !== null && d === end, inside = d !== null && !!start && !!end && d > start && d < end;
      const edge = isStart || isEnd;
      return <View key={i} style={{ width: `${100 / 7}%`, height: 44, justifyContent: "center", alignItems: "center" }}>
        {(inside || (edge && start && end && start !== end)) && <View style={{ position: "absolute", top: 4, bottom: 4, left: isStart ? "50%" : 0, right: isEnd ? "50%" : 0, backgroundColor: c.soft }} />}
        {d && <Pressable accessibilityRole="button" accessibilityLabel={pretty(d)} accessibilityState={{ selected: edge }} onPress={() => onPick(d)} style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: edge ? c.accent : "transparent", borderWidth: d === today && !edge ? 1 : 0, borderColor: c.accent }}>
          <T style={{ fontSize: 15, fontFamily: edge ? "InterSemibold" : "Inter", color: edge ? c.accentText : c.ink }}>{Number(d.slice(8))}</T>
        </Pressable>}
      </View>;
    })}</View>
  </View>;
}

function DateButton({ label, value, placeholder, onPress, disabled }: { label?: string; value: string; placeholder: string; onPress: () => void; disabled: boolean }) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? placeholder}: ${value ? pretty(value) : "not set"}`} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg, paddingHorizontal: 14, paddingVertical: 8, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
    {label && <T style={{ fontSize: 11, color: c.muted, fontFamily: "InterSemibold", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</T>}
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Ionicons name="calendar-outline" size={16} color={c.accent} /><T numberOfLines={1} style={{ color: value ? c.ink : c.muted, flexShrink: 1 }}>{value ? compact(value) : placeholder}</T></View>
  </Pressable>;
}

function DateField({ f, value, onChange, disabled }: { f: MobileField; value: string; onChange: (v: MobileValue) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 8 }}><Label f={f} />
    <DateButton value={value} placeholder="Choose a date" onPress={() => setOpen(true)} disabled={disabled} />
    {f.hint && <Muted>{f.hint}</Muted>}
    <Sheet open={open} title={f.label} close={() => setOpen(false)} footer={value ? <Button secondary onPress={() => { onChange(null); setOpen(false); }}>Clear date</Button> : undefined}>
      <Calendar start={value || null} end={null} onPick={d => { onChange(d); setOpen(false); }} />
    </Sheet>
  </View>;
}

/** Start and end on one calendar: first tap sets the start, second the end. */
function DateRangeField({ start, end, values, onChange, disabled }: { start: MobileField; end: MobileField; values: MobileValues; onChange: (v: MobileValues) => void; disabled: boolean }) {
  const c = useTheme();
  const from = (getValue(values, start.key) as string | null | undefined) || null, to = (getValue(values, end.key) as string | null | undefined) || null;
  const [open, setOpen] = useState(false), [picking, setPicking] = useState<"start" | "end">("start");
  const write = (a: string | null, b: string | null) => onChange(setValue(setValue(values, start.key, a), end.key, b));
  const pick = (d: string) => {
    if (picking === "start" || (from && d < from)) { write(d, to && to >= d ? to : null); setPicking("end"); return; }
    write(from, d); setPicking("start"); setOpen(false);
  };
  const nights = from && to ? Math.round((parse(to)!.getTime() - parse(from)!.getTime()) / 86_400_000) : null;
  return <View style={{ gap: 8 }}>
    <T style={{ fontFamily: "InterSemibold", fontSize: 14 }}>{start.key === "startDate" ? "Trip dates" : start.key === "arriveDate" ? "Stay dates" : "Dates"}</T>
    <View style={{ flexDirection: "row", gap: 8 }}>
      <DateButton label={start.label} value={from ?? ""} placeholder="Start" disabled={disabled} onPress={() => { setPicking("start"); setOpen(true); }} />
      <DateButton label={end.label} value={to ?? ""} placeholder="End" disabled={disabled} onPress={() => { setPicking(from ? "end" : "start"); setOpen(true); }} />
    </View>
    {nights !== null && nights >= 0 && <Muted>{nights + 1} {nights === 0 ? "day" : "days"}</Muted>}
    <Sheet open={open} title={picking === "start" ? "Choose the start date" : "Choose the end date"} close={() => setOpen(false)} footer={<View style={{ flexDirection: "row", gap: 8 }}><Button secondary style={{ flex: 1 }} onPress={() => { write(null, null); setPicking("start"); }}>Clear</Button><Button style={{ flex: 1 }} onPress={() => setOpen(false)}>Done</Button></View>}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["start", "end"] as const).map(k => <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: picking === k }} onPress={() => setPicking(k)} style={{ flex: 1, padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: picking === k ? c.accent : c.line, backgroundColor: c.bg }}>
          <T style={{ fontSize: 11, color: c.muted, fontFamily: "InterSemibold", textTransform: "uppercase" }}>{k === "start" ? start.label : end.label}</T>
          <T style={{ fontFamily: "InterSemibold" }}>{(k === "start" ? from : to) ? pretty(k === "start" ? from : to) : "—"}</T>
        </Pressable>)}
      </View>
      <Calendar start={from} end={to} onPick={pick} />
    </Sheet>
  </View>;
}


