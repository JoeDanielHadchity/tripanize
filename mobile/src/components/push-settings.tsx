import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Switch, View } from "react-native";
import { enablePush, loadPushSettings, pushPermission, pushSupported, savePushSettings, PUSH_LABELS, type PushCategory, type PushPermission, type PushSettings } from "../lib/push";
import { Button, ListRow, Muted, Section } from "./ui";
import { useTheme } from "./theme";

const ICONS = { chat: "chatbubbles-outline", events: "musical-notes-outline", group: "people-outline", reminders: "alarm-outline" } as const;

/** Phone alerts: one system permission, then a switch per kind of alert. */
export function PushSettingsCard() {
  const c = useTheme();
  const [permission, setPermission] = useState<PushPermission>("undetermined");
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    void pushPermission().then(setPermission).catch(() => setPermission("unsupported"));
    void loadPushSettings().then(r => setSettings(r.settings)).catch(() => undefined);
  }, []);
  useEffect(() => { refresh(); const sub = AppState.addEventListener("change", s => { if (s === "active") refresh(); }); return () => sub.remove(); }, [refresh]);
  async function turnOn() {
    setBusy(true); setError(null);
    try { setPermission(await enablePush()); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not turn on notifications."); }
    finally { setBusy(false); }
  }
  async function toggle(key: PushCategory, value: boolean) {
    if (!settings) return;
    const before = settings; setSettings({ ...settings, [key]: value });
    try { setSettings((await savePushSettings({ [key]: value })).settings); } catch { setSettings(before); setError("Could not save this setting."); }
  }
  const on = permission === "granted";
  return <Section title="Notifications">
    {!pushSupported() ? <View style={{ paddingVertical: 14 }}><Muted>Phone notifications are available in the Tripanize app for Android and iPhone.</Muted></View>
      : !on && <View style={{ paddingVertical: 14, gap: 10 }}>
        <Muted>{permission === "denied" ? "Notifications are off for Tripanize in your phone settings." : "Get chat messages, new events and the day's plan as they happen."}</Muted>
        {permission === "denied" ? <Button secondary compact leadingIcon="settings-outline" onPress={() => void Linking.openSettings()}>Open phone settings</Button> : <Button compact leadingIcon="notifications" busy={busy} onPress={() => void turnOn()}>Turn on notifications</Button>}
      </View>}
    {(Object.keys(PUSH_LABELS) as PushCategory[]).map((key, i, all) => <ListRow key={key} icon={ICONS[key]} title={PUSH_LABELS[key].title} subtitle={PUSH_LABELS[key].text} last={i === all.length - 1}
      trailing={<Switch accessibilityLabel={PUSH_LABELS[key].title} value={settings?.[key] ?? true} disabled={!settings} onValueChange={v => void toggle(key, v)} trackColor={{ true: c.accent, false: c.line }} thumbColor="#ffffff" />} />)}
    {error && <View style={{ paddingVertical: 10 }}><Muted style={{ color: c.danger }}>{error}</Muted></View>}
  </Section>;
}
