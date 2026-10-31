import { useState } from "react";
import { Pressable, Switch, TextInput, View } from "react-native";
import { Button, Card, Muted, T } from "./ui";
import { useTheme } from "./theme";
import { formDefaults, getValue, setValue, type MobileField, type MobileValue, type MobileValues } from "../lib/workspace";

export function Fields({ fields, values, onChange, disabled = false }: { fields: MobileField[]; values: MobileValues; onChange: (v: MobileValues) => void; disabled?: boolean }) {
  return <>{fields.filter(f => f.kind !== "files").map(field => <Field key={field.key} field={field} value={getValue(values, field.key)} onChange={value => onChange(setValue(values, field.key, value))} disabled={disabled} />)}</>;
}
function Field({ field: f, value, onChange, disabled }: { field: MobileField; value: MobileValue | undefined; onChange: (v: MobileValue) => void; disabled: boolean }) {
  const c = useTheme(); const [expanded, setExpanded] = useState(false);
  const label = <T style={{ fontFamily: "InterSemibold", fontSize: 14 }}>{f.label}{f.required ? " *" : ""}</T>;
  if (f.kind === "check") return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>{label}<Switch accessibilityLabel={f.label} disabled={disabled} value={value === true} onValueChange={onChange} trackColor={{ true: c.accent, false: c.line }} thumbColor="#ffffff" /></View>;
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
  return <View style={{ gap: 8 }}>{label}<TextInput accessibilityLabel={f.label} editable={!disabled} placeholder={f.kind === "date" ? "YYYY-MM-DD" : f.kind === "time" ? "HH:MM" : undefined} placeholderTextColor={c.muted} value={string} onChangeText={text => onChange(f.kind === "number" ? text === "" ? null : Number.isFinite(Number(text)) ? Number(text) : text : f.kind === "list" ? text.split("\n") : text)} multiline={f.kind === "long" || f.kind === "list"} keyboardType={f.kind === "money" || f.kind === "number" ? "decimal-pad" : f.key.toLowerCase().includes("email") ? "email-address" : "default"} autoCapitalize={/currency/i.test(f.key) ? "characters" : /url|email|timezone|startsAt|endsAt/i.test(f.key) ? "none" : "sentences"} autoCorrect={!/url|email|timezone/i.test(f.key)} style={{ backgroundColor: c.bg, color: c.ink, fontFamily: "Inter", borderWidth: 1, borderColor: c.line, borderRadius: 14, fontSize: 16, paddingHorizontal: 15, paddingVertical: 13, minHeight: f.kind === "long" || f.kind === "list" ? 90 : 48, textAlignVertical: "top" }} />{f.hint && <Muted>{f.hint}</Muted>}</View>;
}
