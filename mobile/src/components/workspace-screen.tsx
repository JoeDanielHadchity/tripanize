import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import * as Crypto from "expo-crypto";
import { router, useFocusEffect } from "expo-router";
import { authClient, post } from "../lib/auth";
import { clearApiCache, useApi } from "../lib/data";
import { isSection, registerTripBase, sendToTripBase, SECTION_ORDER, TRIP_SECTIONS } from "../lib/trip-nav";
import { workspaceHref, workspacePath, formDefaults, cleanValues, type MobileWorkspace, type MobileAction, type MobileBlock, type MobileTarget, type MobileValues, type MobileCommandResult } from "../lib/workspace";
import { pickFiles, uploadFiles, shareDownload, type PickedFile } from "../lib/files";
import { saveOfflineItinerary, clearOfflineItineraries } from "../lib/offline";
import { buyTripPremium } from "../lib/purchases";
import { unregisterPush } from "../lib/push";
import { useTheme, useAppearance } from "./theme";
import { Fields } from "./form-fields";
import { NativeItinerary } from "./native-itinerary";
import { ActionRow, Sheet, TripHeader, TripHero, TripNavigation, TripSkeleton } from "./trip-ui";
import { NativeLocation } from "./native-location";
import { PushSettingsCard } from "./push-settings";
import { Avatar, Button, Card, EmptyState, ErrorNotice, Heading, Icon, IconButton, ListRow, Loading, Muted, Screen, ScreenHeader, Section, Segmented, T, styles, type IconName } from "./ui";

function confirmAction(message?: string): Promise<boolean> {
  if (!message) return Promise.resolve(true);
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise(resolve => Alert.alert("Confirm change", message, [{ text: "Cancel", style: "cancel", onPress: () => resolve(false) }, { text: "Continue", onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) }));
}
export async function signOut() { await unregisterPush(); await clearOfflineItineraries(); clearApiCache(); await authClient.signOut(); router.replace("/"); }

const query = (path: string) => new URLSearchParams(path.split("?")[1] ?? "");
/** Same screen of the same trip (for example another day of the itinerary). */
const sameKind = (a: string, b: string) => query(a).get("screen") === query(b).get("screen") && query(a).get("tripId") === query(b).get("tripId");
/** Trip names stay in the header while a section loads. */
const tripNames = new Map<string, NonNullable<MobileWorkspace["trip"]>>();
const tripPremium = new Map<string, boolean>();

const ago = (iso: string) => {
  const ms = Date.now() - Date.parse(iso); if (!Number.isFinite(ms)) return iso;
  const m = Math.round(ms / 60_000); if (m < 1) return "Just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return d < 7 ? `${d} d ago` : new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
};
const NAV_ICONS: Record<string, IconName> = { notifications: "notifications-outline", trips: "mail-open-outline", admin: "shield-checkmark-outline", new: "add-circle-outline", discovery: "compass-outline", sharing: "people-outline", premium: "sparkles-outline", votes: "hand-left-outline", versions: "time-outline", assistant: "chatbubble-ellipses-outline", plan: "sparkles-outline", packing: "bag-handle-outline", events: "musical-notes-outline", bookings: "ticket-outline", settings: "settings-outline", expenses: "wallet-outline", chat: "chatbubbles-outline", locations: "location-outline", itinerary: "map-outline" };
/** Blocks that only link elsewhere read better as a native list. */
const isNavBlock = (b: MobileBlock) => !b.title && !b.text && !b.form && !b.lines?.length && !b.image && !b.location && (b.actions?.length ?? 0) >= 2 && b.actions!.every(a => a.to && !a.action);

export function WorkspaceScreen({ target, account = false, tab = false }: { target: MobileTarget; account?: boolean; tab?: boolean }) {
  const content = useRef<ScrollView>(null);
  // A trip section screen stays mounted and switches sections/days in place.
  const isBase = isSection(target);
  const [current, setCurrent] = useState<MobileTarget>(target), [dir, setDir] = useState(0);
  const path = workspacePath(current), { data, stale, error, loading, reload, status } = useApi<MobileWorkspace>(path);
  // While the next day or section loads, keep the previous one (dimmed) instead of a blank screen.
  const staleShown = !data && stale && sameKind(stale.path, path) ? stale.data : null;
  const display = data ?? staleShown;
  const [actionError, setActionError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [sharedUrl, setSharedUrl] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [review, setReview] = useState<MobileCommandResult["review"] | null>(null);
  const c = useTheme(), appearance = useAppearance();
  const { data: session } = authClient.useSession();
  const pollMs = data?.pollMs;
  const [fade] = useState(() => new Animated.Value(0)), [shift] = useState(() => new Animated.Value(0));
  useFocusEffect(useCallback(() => {
    reload();
    const listener = AppState.addEventListener("change", state => { if (state === "active") reload(); });
    const timer = pollMs ? setInterval(() => { if (AppState.currentState === "active") reload(); }, pollMs) : null;
    return () => { listener.remove(); if (timer) clearInterval(timer); };
  }, [pollMs, reload]));
  useEffect(() => isBase && target.tripId ? registerTripBase(target.tripId, to => { setDir(0); setCurrent(to); reload(); }) : undefined, [isBase, target.tripId, reload]);
  useEffect(() => { if (data?.trip && data.tripId) { tripNames.set(data.tripId, data.trip); tripPremium.set(data.tripId, Boolean(data.premium)); } }, [data]);
  // New section or day: start from the side we are moving towards, then settle in.
  useEffect(() => {
    fade.setValue(staleShown ? 0.45 : 0); shift.setValue(dir * 36);
    content.current?.scrollTo({ y: 0, animated: false });
    // Only a change of screen restarts the transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const ready = Boolean(data);
  useEffect(() => {
    if (!ready) return;
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(shift, { toValue: 0, damping: 22, stiffness: 220, mass: 0.9, useNativeDriver: true }),
    ]).start();
  }, [ready, path, fade, shift]);

  function direction(from: MobileTarget, to: MobileTarget) {
    if (from.screen === "itinerary" && to.screen === "itinerary" && display?.itinerary) {
      const ids = display.itinerary.days.map(d => d.id);
      const a = ids.indexOf(from.item ?? display.itinerary.selectedDay?.id ?? ""), b = ids.indexOf(to.item ?? "");
      return b > a ? 1 : b < a ? -1 : 0;
    }
    const a = SECTION_ORDER.indexOf(from.screen), b = SECTION_ORDER.indexOf(to.screen);
    return b > a ? 1 : b < a ? -1 : 0;
  }
  /** One rule for every move: sections change in place, details slide in on top,
   * and a detail that finishes hands its destination back to the trip below it. */
  function go(to: MobileTarget, finished = false) {
    setActionError(null);
    if (!finished) { setNotice(null); setSharedUrl(null); }
    if (to.screen === "trips") { router.navigate("/trips"); return; }
    if (isBase && to.tripId === current.tripId && TRIP_SECTIONS.has(to.screen)) {
      if (workspacePath(to) === path) { reload(); return; }
      setDir(direction(current, to)); setCurrent(to); return;
    }
    if (!isBase && current.tripId && to.tripId === current.tripId && TRIP_SECTIONS.has(to.screen) && router.canGoBack() && sendToTripBase(to.tripId, to)) { router.back(); return; }
    const href = workspaceHref(to, Crypto.randomUUID());
    if (finished && !isBase && router.canGoBack()) router.replace(href); else router.push(href);
  }
  async function result(r: MobileCommandResult) {
    if (r.review) { setReview(r.review); content.current?.scrollTo({ y: 0, animated: true }); return; }
    setReview(null);
    if (r.signedOut) { await signOut(); return; }
    setNotice(r.message ?? null); setSharedUrl(r.url ?? null);
    if (r.to) go(r.to, true); else reload();
  }
  async function run(action: MobileAction) {
    if (action.to) { go(action.to); return; }
    if (!await confirmAction(action.confirm)) return;
    setBusy(true); setActionError(null);
    try {
      if (action.device === "purchase" && display?.tripId) {
        const outcome = await buyTripPremium(display.tripId);
        if (outcome.status === "completed") setNotice("Premium is active for everyone in this trip. Enjoy!");
        else if (outcome.status === "pending") setNotice("Your payment is pending with the store. Premium turns on automatically once it's approved.");
        reload();
      }
      else if (action.device === "offline" && display?.tripId && session?.user.id) { await saveOfflineItinerary(session.user.id, display.tripId); setNotice("Read-only itinerary saved for offline use. It is removed when you sign out."); }
      else if (action.device === "file" && action.url) await shareDownload(action.url, action.fileName ?? "Tripanize-document.pdf");
      else if (action.url) { const u = new URL(action.url); if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) throw new Error("Invalid link."); await Linking.openURL(u.href); }
      else if (action.action) await result(await post<MobileCommandResult>("/api/mobile/workspace", { action: action.action, tripId: display?.tripId ?? current.tripId, values: cleanValues(action.values ?? {}) }));
    } catch (e) { setActionError(e instanceof Error ? e.message : "Could not complete this action."); content.current?.scrollTo({ y: 0, animated: true }); }
    finally { setBusy(false); }
  }
  const onAction = (action: MobileAction) => { void run(action); };

  const renderBlock = (block: MobileBlock) => {
    if (isNavBlock(block)) return <Section key={block.id}>{block.actions!.map((a, i) => <ListRow key={`${a.label}-${i}`} icon={NAV_ICONS[a.to!.screen] ?? "arrow-forward-circle-outline"} title={a.label} onPress={() => onAction(a)} last={i === block.actions!.length - 1} />)}</Section>;
    const accent = block.tone === "accent", warning = block.tone === "warning";
    const purchase = block.actions?.some(a => a.device === "purchase");
    return <Card key={block.id} style={{ gap: 12, ...(accent ? { backgroundColor: c.soft } : warning ? { backgroundColor: c.coralSoft } : {}) }}>
      {block.image && <View style={{ marginHorizontal: -6, marginTop: -6 }}><Image source={block.image.url} style={{ height: 170, borderRadius: 16, width: "100%" }} contentFit="cover" transition={150} />{block.image.credit && <Muted style={{ fontSize: 10, marginTop: 4 }}>{block.image.credit}</Muted>}</View>}
      {warning && !block.title && <Icon name="information-circle" color={c.coral} />}
      {block.title && <Heading small>{block.title}</Heading>}{block.meta && <Muted>{block.meta}</Muted>}{block.text && <T selectable style={{ color: accent || warning ? c.ink : c.ink }}>{block.text}</T>}
      {!!block.lines?.length && <View style={{ gap: 8 }}>{block.lines.map((line, i) => <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent, marginTop: 8 }} /><T style={{ fontSize: 14, lineHeight: 21, flex: 1 }}>{line}</T></View>)}</View>}
      {block.actions?.length ? <ActionRow actions={block.actions} onAction={onAction} busy={busy} primary={accent || purchase} /> : null}
      {block.location && <NativeLocation key={block.location.tripId} tripId={block.location.tripId} onChange={reload} />}
      {block.form && <NativeForm key={`${path}-${block.id}`} block={block} tripId={display?.tripId} disabled={busy} onResult={result} />}
    </Card>;
  };

  const inTrip = Boolean(current.tripId);
  const isAccount = account || current.screen === "account";
  const cover = display?.blocks.find(b => b.id === "cover")?.image;
  const showAssistant = display?.premium && display.tripId && !["assistant", "setup", "premium"].includes(current.screen);
  const itinerary = display?.itinerary?.selectedDay && current.screen === "itinerary";
  const header = display?.trip ? display : current.tripId && tripNames.has(current.tripId) ? { ...display, title: display?.title ?? "", blocks: [], trip: tripNames.get(current.tripId) } as MobileWorkspace : display;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    {inTrip && <TripHeader data={header} loading={loading && !!display} onBack={() => router.canGoBack() ? router.back() : router.replace("/trips")} right={<IconButton name="notifications-outline" label="Notifications" onPress={() => go({ screen: "notifications" })} />} />}
    <View style={{ flex: 1 }}><Screen scrollRef={content} refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={c.accent} />} style={{ gap: 16, paddingTop: inTrip ? 4 : 8, paddingBottom: showAssistant ? 100 : 32 }}>
      {!inTrip && (isAccount && session ? <View style={{ alignItems: "center", gap: 8, paddingTop: 10 }}><Avatar name={session.user.name || session.user.email} size={76} /><Heading>{session.user.name || "Your account"}</Heading><Muted>{session.user.email}</Muted></View>
        : <ScreenHeader back={!tab} title={display?.title ?? (current.screen === "notifications" ? "Inbox" : " ")} subtitle={display?.subtitle} />)}
      {(error || actionError) && <ErrorNotice message={actionError ?? error!} retry={reload} />}
      {error && ![401, 403, 404].includes(status ?? 0) && current.tripId && <Button secondary onPress={() => router.push({ pathname: "/trip/[id]", params: { id: current.tripId! } })}>Open saved itinerary</Button>}
      {review && <Card style={{ backgroundColor: c.soft }}><Heading small>{review.title}</Heading>{review.lines.map((line, i) => <T key={i}>{line}</T>)}<Button disabled={busy} onPress={() => void run({ label: "Apply changes", action: review.action, values: review.values })}>Apply reviewed changes</Button><Button secondary onPress={() => setReview(null)}>Keep editing</Button></Card>}
      {notice && <Card style={{ backgroundColor: c.soft, flexDirection: "row", alignItems: "center" }}><Icon name="checkmark-circle" color={c.success} /><T style={{ flex: 1 }}>{notice}</T><IconButton name="close" size={32} label="Dismiss" onPress={() => setNotice(null)} /></Card>}
      {sharedUrl && <Card><T selectable>{sharedUrl}</T><Button leadingIcon="share-outline" onPress={() => void Share.share({ message: sharedUrl, url: sharedUrl })}>Share invitation link</Button></Card>}
      {!display && loading && !error && (inTrip ? <TripSkeleton hero={current.screen === "itinerary"} /> : <Loading />)}
      {display && <Animated.View pointerEvents={staleShown ? "none" : "auto"} style={{ gap: 16, opacity: fade, transform: [{ translateX: shift }] }}>
        {inTrip && (itinerary ? <TripHero data={display} cover={cover} /> : <View style={{ gap: 4, paddingHorizontal: 4 }}><Heading small>{display.title}</Heading>{display.subtitle && <Muted>{display.subtitle}</Muted>}</View>)}
        {itinerary ? <NativeItinerary data={display} onAction={onAction} busy={busy || !!staleShown} renderBlock={renderBlock} pendingDay={staleShown ? current.item : undefined} />
          : current.screen === "notifications" ? <Inbox blocks={display.blocks} busy={busy} loading={loading} onAction={onAction} />
          : display.blocks.filter(b => b.id !== "cover").map(renderBlock)}
      </Animated.View>}
      {isAccount && <>
        <PushSettingsCard />
        <Section title="Appearance"><View style={{ paddingVertical: 12 }}><Segmented label="Appearance" value={appearance.choice} onChange={appearance.set} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "Auto" }]} /></View></Section>
        <Section title="This device">
          <ListRow icon="cloud-offline-outline" title="Saved offline itineraries" onPress={() => router.push("/offline")} />
          <ListRow icon="trash-outline" title="Remove offline copies" onPress={() => void clearOfflineItineraries().then(() => setNotice("Saved offline itineraries removed.")).catch(e => setActionError(e.message))} />
          <ListRow icon="log-out-outline" title="Sign out" tone="danger" onPress={() => void signOut()} last />
        </Section>
      </>}
    </Screen>{showAssistant && <View pointerEvents="box-none" style={{ position: "absolute", bottom: 14, right: 16 }}><Button leadingIcon="sparkles" tone="coral" disabled={busy} style={{ borderRadius: 28, boxShadow: "0 6px 18px rgba(181,90,60,0.35)" }} onPress={() => go({ screen: "assistant", tripId: display.tripId, day: display.itinerary?.selectedDay?.date })}>Ask AI</Button></View>}</View>
    {current.tripId && <TripNavigation tripId={current.tripId} screen={current.screen} premium={display?.premium ?? tripPremium.get(current.tripId)} onAction={action => { if (action.to) go(action.to); }} />}
  </KeyboardAvoidingView>;
}

function Inbox({ blocks, busy, loading, onAction }: { blocks: MobileBlock[]; busy: boolean; loading: boolean; onAction: (a: MobileAction) => void }) {
  const c = useTheme();
  const items = blocks.filter(b => b.text && b.title), rest = blocks.filter(b => !items.includes(b));
  const markAll = rest.find(b => b.id === "read")?.actions?.[0], older = rest.find(b => b.id === "older")?.actions?.[0];
  const icon = (text: string): IconName => /message/i.test(text) ? "chatbubbles-outline" : /event/i.test(text) ? "musical-notes-outline" : /expense|repayment/i.test(text) ? "wallet-outline" : /vote/i.test(text) ? "hand-left-outline" : /joined|left the trip|invit/i.test(text) ? "people-outline" : "sync-outline";
  return <>
    {markAll && items.some(i => i.meta?.includes("Unread")) && <Button compact secondary leadingIcon="checkmark-done" style={{ alignSelf: "flex-start" }} disabled={busy} onPress={() => onAction(markAll)}>Mark all read</Button>}
    {!items.length && !loading && <EmptyState icon="notifications-off-outline" title="You're all caught up" text="Changes from your group, new events and reminders appear here." />}
    {items.length > 0 && <Card style={{ paddingVertical: 4, gap: 0 }}>{items.map((n, i) => {
      const unread = n.meta?.includes("Unread"), view = n.actions?.find(a => a.to), read = n.actions?.find(a => a.action);
      const when = n.meta?.split(" · ")[0] ?? "";
      return <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`${unread ? "Unread. " : ""}${n.title}. ${n.text}`} onPress={() => { if (read) onAction(read); if (view) onAction(view); }} style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingVertical: 14, borderBottomWidth: i === items.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: unread ? c.soft : c.bg, alignItems: "center", justifyContent: "center" }}><Icon name={icon(n.text!)} size={18} color={unread ? c.accent : c.muted} /></View>
        <View style={{ flex: 1, gap: 2 }}><View style={styles.row}><T numberOfLines={1} style={{ flex: 1, fontFamily: "InterSemibold", fontSize: 14 }}>{n.title}</T><T style={{ fontSize: 11, color: c.muted }}>{ago(when)}</T></View><T style={{ fontSize: 14, lineHeight: 20, color: unread ? c.ink : c.muted }}>{n.text}</T></View>
        {unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.coral, marginTop: 6 }} />}
      </Pressable>;
    })}</Card>}
    {older && <Button secondary compact onPress={() => onAction(older)}>Older notifications</Button>}
  </>;
}

function NativeForm({ block, tripId, onResult, disabled }: { block: MobileBlock; tripId?: string; onResult: (r: MobileCommandResult) => Promise<void>; disabled: boolean }) {
  const c = useTheme();
  const spec = block.form!;
  const defaults = () => formDefaults(spec.fields, spec.values);
  const dirty = useRef(false);
  // Short or primary forms stay inline; longer secondary ones open in a sheet.
  const inline = spec.fields.length <= 4 || ["create", "questions", "details", "booking", "expense", "chat", "ask"].includes(block.id);
  const [values, setValues] = useState<MobileValues>(defaults), [files, setFiles] = useState<PickedFile[]>([]), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false), [open, setOpen] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const fileField = spec.fields.find(f => f.kind === "files");
  const received = JSON.stringify(spec.values ?? {});
  useEffect(() => { if (!dirty.current) setValues(formDefaults(spec.fields, spec.values)); }, [received, spec.fields, spec.values]);
  async function choose(source: "camera" | "photos" | "files") {
    setError(null);
    try { const incoming = await pickFiles(source); const all = [...files, ...incoming]; if (spec.upload === "booking" && all.length > 1) throw new Error("Attach one booking document at a time."); if (all.length > 5 || all.reduce((s, f) => s + f.size, 0) > 10 * 1024 * 1024) throw new Error("Attach up to five files, totaling 10 MB."); setFiles(all); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not select this file."); }
  }
  async function submit() {
    if (!await confirmAction(spec.confirm)) return;
    setBusy(true); setError(null);
    try {
      const cleaned = cleanValues(values);
      const r = spec.upload && tripId ? await uploadFiles(tripId, spec.upload, cleaned, files) : await post<MobileCommandResult>("/api/mobile/workspace", { action: spec.action, tripId, values: cleaned });
      if (r.review) { setOpen(false); await onResult(r); return; }
      setFiles([]); dirty.current = false;
      if (["chat", "ask"].includes(block.id)) setValues({ ...defaults(), clientId: Crypto.randomUUID() });
      if (spec.action === "packing.add" || spec.action === "task.add") setValues(defaults());
      setOpen(false);
      await onResult(r);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save. Your entries are still here."); }
    finally { setBusy(false); }
  }
  const body = <>
    <Fields fields={spec.fields} values={values} onChange={v => { dirty.current = true; setValues(v); }} disabled={busy || disabled} />
    {fileField && <View style={{ gap: 10 }}><T style={{ fontFamily: "InterSemibold" }}>{fileField.label}</T><View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}><Button compact secondary leadingIcon="camera-outline" disabled={busy} onPress={() => void choose("camera")}>Camera</Button><Button compact secondary leadingIcon="images-outline" disabled={busy} onPress={() => void choose("photos")}>Photos</Button><Button compact secondary leadingIcon="document-attach-outline" disabled={busy} onPress={() => void choose("files")}>PDF or image</Button></View>
      {files.map((file, i) => <View key={`${file.uri}-${i}`} style={[styles.row, { backgroundColor: c.bg, borderRadius: 12, padding: 10 }]}><Icon name="document-outline" size={18} /><T numberOfLines={1} style={{ flex: 1 }}>{file.name}</T><IconButton name="close" size={32} label={`Remove ${file.name}`} disabled={busy} onPress={() => setFiles(files.filter((_, at) => at !== i))} /></View>)}
      {spec.upload === "expense" && files.length > 0 && <Button secondary busy={busy} onPress={async () => { setBusy(true); setError(null); try { const r = await uploadFiles(tripId!, "scan", {}, [files[0]]); if (r.scan) { const scan = r.scan; dirty.current = true; setValues(old => ({ ...old, ...(scan.merchant ? { description: scan.merchant } : {}), ...(scan.amount ? { amount: scan.amount } : {}), ...(scan.currency ? { currency: scan.currency } : {}), ...(scan.date ? { date: scan.date } : {}), category: scan.category })); setScanNote(["Review the extracted details before saving.", ...scan.warnings].join(" ")); } } catch (e) { setError(e instanceof Error ? e.message : "Could not scan this receipt."); } finally { setBusy(false); } }}>★ Scan first receipt</Button>}
    </View>}
    {scanNote && <Muted>{scanNote}</Muted>}{error && <ErrorNotice message={error} />}
  </>;
  const submitButton = <Button busy={busy} disabled={disabled} onPress={() => void submit()}>{spec.label}</Button>;
  const reset = error ? <Button secondary compact onPress={() => { dirty.current = false; setValues(defaults()); setError(null); }}>Reset to latest saved values</Button> : null;
  if (inline) return <View style={{ gap: 16 }}>{body}{submitButton}{reset}</View>;
  return <>
    <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setOpen(true)} style={({ pressed }) => [styles.row, { backgroundColor: c.bg, borderRadius: 14, paddingHorizontal: 14, minHeight: 52, opacity: pressed ? 0.7 : 1 }]}><View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}><Icon name="create-outline" size={19} /><T style={{ fontFamily: "InterSemibold", flex: 1 }}>{spec.label}</T></View><Icon name="chevron-up" size={18} color={c.muted} /></Pressable>
    <Sheet open={open} title={block.title ?? spec.label} close={() => setOpen(false)} footer={<View style={{ gap: 8 }}>{submitButton}{reset}</View>}>{body}</Sheet>
  </>;
}
