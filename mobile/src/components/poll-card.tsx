import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MobileAction, MobileBlock } from "../lib/workspace";
import { Badge, Card, Muted, T, styles } from "./ui";
import { useTheme } from "./theme";

type Option = { label: string; count: number; mine: boolean; chosen: boolean; action?: MobileAction };

/** Group votes from the server: a block whose lines are "label: count" rows. */
export const isPoll = (b: MobileBlock) => Boolean(b.lines?.length && /^(OPEN|DECIDED|ARCHIVED) · \d+ votes?$/.test(b.meta ?? ""));

function readOptions(block: MobileBlock): Option[] {
  return (block.lines ?? []).map(line => {
    const m = /^(✓ )?(.*): (\d+)( · Your vote)?$/.exec(line);
    const label = m?.[2] ?? line;
    const action = block.actions?.find(a => a.action === "poll.vote" && (a.label === `Vote: ${label}` || a.label === `Undo vote: ${label}`));
    return { label, count: Number(m?.[3] ?? 0), mine: Boolean(m?.[4]), chosen: Boolean(m?.[1]), action };
  });
}

/** Tap an option to vote (tap again to undo). Bars show how the group voted. */
export function PollCard({ block, busy, onAction }: { block: MobileBlock; busy: boolean; onAction: (a: MobileAction) => void }) {
  const c = useTheme();
  const options = readOptions(block), total = Math.max(1, options.reduce((n, o) => n + o.count, 0));
  const status = (block.meta ?? "").split(" · ")[0], open = status === "OPEN";
  return <Card style={{ gap: 12 }}>
    <View style={styles.row}><Badge tone={open ? "accent" : "coral"} icon={open ? "hand-left-outline" : "checkmark-done"}>{open ? "Poll · open" : status === "DECIDED" ? "Decided" : "Archived"}</Badge><Muted>{(block.meta ?? "").split(" · ")[1]}</Muted></View>
    <T style={{ fontFamily: "NunitoHeading", fontSize: 21, lineHeight: 27 }}>{block.title}</T>
    {block.text && <Muted>{block.text}</Muted>}
    <View style={{ gap: 8 }}>{options.map(o => {
      const pct = Math.round(o.count / total * 100), highlight = o.mine || o.chosen;
      return <Pressable key={o.label} accessibilityRole="button" accessibilityLabel={`${o.label}, ${o.count} votes${o.mine ? ", your vote" : ""}`} disabled={!o.action || busy} onPress={() => o.action && onAction(o.action)} style={({ pressed }) => ({ minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: highlight ? c.accent : c.line, overflow: "hidden", justifyContent: "center", opacity: pressed ? 0.75 : 1 })}>
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${o.count ? pct : 0}%`, backgroundColor: highlight ? c.soft : c.bg }} />
        <View style={[styles.row, { paddingHorizontal: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}><Ionicons name={o.mine ? "checkmark-circle" : o.chosen ? "trophy" : "ellipse-outline"} size={18} color={highlight ? c.accent : c.muted} /><T style={{ flex: 1, fontFamily: highlight ? "NunitoBold" : "Nunito" }}>{o.label}</T></View>
          <T style={{ fontSize: 13, color: c.muted, fontVariant: ["tabular-nums"] }}>{o.count} · {pct}%</T>
        </View>
      </Pressable>;
    })}</View>
    {open && <Muted style={{ fontSize: 12 }}>Tap a choice to vote. Tap your choice again to undo.</Muted>}
  </Card>;
}
