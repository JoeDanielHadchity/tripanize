import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, View } from "react-native";
import { Image } from "expo-image";
import * as Crypto from "expo-crypto";
import { router, useFocusEffect } from "expo-router";
import { authClient, post } from "../lib/auth";
import { useApi } from "../lib/data";
import { workspaceHref, workspacePath, formDefaults, cleanValues, type MobileWorkspace, type MobileAction, type MobileBlock, type MobileTarget, type MobileValues, type MobileCommandResult } from "../lib/workspace";
import { pickFiles, uploadFiles, shareDownload, type PickedFile } from "../lib/files";
import { saveOfflineItinerary, clearOfflineItineraries } from "../lib/offline";
import { useTheme, useAppearance } from "./theme";
import { Fields } from "./form-fields";
import { NativeLocation } from "./native-location";
import { Button, Card, ErrorNotice, Heading, Icon, Loading, Muted, Screen, T, styles } from "./ui";

function navigate(to: MobileTarget, replace = false) {
  if (to.screen === "trips") { router.replace("/trips"); return; }
  const href = workspaceHref(to, Crypto.randomUUID());
  if (replace) router.replace(href); else router.push(href);
}
function confirmAction(message?: string): Promise<boolean> {
  if (!message) return Promise.resolve(true);
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise(resolve => Alert.alert("Confirm change", message, [{ text: "Cancel", style: "cancel", onPress: () => resolve(false) }, { text: "Continue", onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) }));
}
export function WorkspaceScreen({ target, account = false }: { target: MobileTarget; account?: boolean }) {
  const path = workspacePath(target), { data, error, loading, reload, status } = useApi<MobileWorkspace>(path);
  const [actionError, setActionError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [sharedUrl, setSharedUrl] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [review, setReview] = useState<MobileCommandResult["review"] | null>(null);
  const c = useTheme(), appearance = useAppearance();
  const { data: session } = authClient.useSession();
  const pollMs = data?.pollMs;
  useFocusEffect(useCallback(() => {
    reload();
    const listener = AppState.addEventListener("change", state => { if (state === "active") reload(); });
    const timer = pollMs ? setInterval(() => { if (AppState.currentState === "active") reload(); }, pollMs) : null;
    return () => { listener.remove(); if (timer) clearInterval(timer); };
  }, [pollMs, reload]));
  async function result(r: MobileCommandResult) {
    if (r.review) { setReview(r.review); return; }
    setReview(null);
    if (r.signedOut) { await clearOfflineItineraries(); await authClient.signOut(); router.replace("/"); return; }
    setNotice(r.message ?? null); setSharedUrl(r.url ?? null);
    if (r.to) navigate(r.to, true); else reload();
  }
  async function run(action: MobileAction) {
    if (action.to) { setActionError(null); setNotice(null); setSharedUrl(null); navigate(action.to); return; }
    if (!await confirmAction(action.confirm)) return;
    setBusy(true); setActionError(null);
    try {
      if (action.device === "offline" && data?.tripId && session?.user.id) { await saveOfflineItinerary(session.user.id, data.tripId); setNotice("Read-only itinerary saved for offline use. It is removed when you sign out."); }
      else if (action.device === "file" && action.url) await shareDownload(action.url, action.fileName ?? "Tripanize-document.pdf");
      else if (action.url) { const u = new URL(action.url); if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) throw new Error("Invalid link."); await Linking.openURL(u.href); }
      else if (action.action) await result(await post<MobileCommandResult>("/api/mobile/workspace", { action: action.action, tripId: data?.tripId, values: cleanValues(action.values ?? {}) }));
    } catch (e) { setActionError(e instanceof Error ? e.message : "Could not complete this action."); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}><Screen style={{ maxWidth: 640, padding: 20, gap: 18 }}>
    <View style={[styles.row, { justifyContent: "flex-end" }]}><View style={{ flexDirection: "row", gap: 16 }}><Pressable accessibilityRole="button" accessibilityLabel="My trips" onPress={() => router.replace("/trips")}><Icon name="briefcase-outline" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => navigate({ screen: "notifications" })}><Icon name="notifications-outline" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace("/")}><Icon name="arrow-back" /></Pressable></View></View>
    {data?.tripId && <Muted>{data.role === "OWNER" ? "Organizer" : data.role === "COLLABORATOR" ? "Editor" : "Viewer"}{data.premium ? " · ★ Premium" : " · Standard"}</Muted>}
    <Heading>{data?.title ?? (account || target.screen === "account" ? "Account" : "Your trip.")}</Heading>{data?.subtitle && <Muted>{data.subtitle}</Muted>}
    {data?.tabs && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{data.tabs.map(tab => <Pressable key={tab.to.screen} accessibilityRole="button" accessibilityState={{ selected: tab.to.screen === target.screen }} onPress={() => navigate(tab.to, true)} style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: tab.to.screen === target.screen ? c.accent : c.paper }}><T style={{ color: tab.to.screen === target.screen ? c.accentText : c.ink, fontSize: 13 }}>{tab.label}{tab.premium ? " ★" : ""}</T></Pressable>)}</ScrollView>}
    {(error || actionError) && <ErrorNotice message={actionError ?? error!} retry={reload} />}{loading && !data && <Loading />}
    {error && ![401, 403, 404].includes(status ?? 0) && target.tripId && <Button secondary onPress={() => router.push({ pathname: "/trip/[id]", params: { id: target.tripId! } })}>Open saved itinerary</Button>}
    {review && <Card style={{ borderColor: c.accent }}><Heading small>{review.title}</Heading>{review.lines.map((line, i) => <T key={i}>{line}</T>)}<Button disabled={busy} onPress={() => void run({ label: "Apply changes", action: review.action, values: review.values })}>Apply reviewed changes</Button><Button secondary onPress={() => setReview(null)}>Keep editing</Button></Card>}
    {notice && <Card><T>{notice}</T></Card>}{sharedUrl && <Card><T selectable>{sharedUrl}</T><Button secondary onPress={() => void Share.share({ message: sharedUrl, url: sharedUrl })}>Share invitation link</Button></Card>}
    {data?.blocks.map(block => <Card key={block.id} style={{ gap: 13, ...(block.tone === "accent" ? { backgroundColor: c.soft, borderColor: c.accent } : block.tone === "warning" ? { borderColor: c.coral } : {}) }}>
      {block.image && <><Image source={block.image.url} style={{ height: 180, borderRadius: 14, width: "100%" }} contentFit="cover" />{block.image.credit && <Muted>{block.image.credit}</Muted>}</>}
      {block.title && <Heading small>{block.title}</Heading>}{block.meta && <Muted>{block.meta}</Muted>}{block.text && <T selectable>{block.text}</T>}
      {block.lines?.map((line, i) => <T key={i} style={{ fontSize: 14 }}>{line}</T>)}
      {block.actions?.map((a, i) => <Button key={`${a.label}-${i}`} secondary disabled={busy} onPress={() => void run(a)}>{a.label}</Button>)}
      {block.location && <NativeLocation key={block.location.tripId} tripId={block.location.tripId} onChange={reload} />}
      {block.form && <NativeForm key={`${path}-${block.id}`} block={block} tripId={data.tripId} disabled={busy} onResult={result} />}
    </Card>)}
    {account && <Card><Heading small>Appearance</Heading><View style={{ gap: 8 }}>{(["light", "dark", "system"] as const).map(value => <Button key={value} secondary onPress={() => appearance.set(value)}>{appearance.choice === value ? "✓ " : ""}{value[0].toUpperCase() + value.slice(1)}</Button>)}</View><Button secondary onPress={() => void clearOfflineItineraries().then(() => setNotice("Saved offline itineraries removed.")).catch(e => setActionError(e.message))}>Remove saved offline itineraries</Button><Button secondary onPress={async () => { await clearOfflineItineraries(); await authClient.signOut(); router.replace("/"); }}>Sign out</Button></Card>}
    {data && <Button secondary busy={loading} onPress={reload}>Refresh</Button>}
  </Screen></KeyboardAvoidingView>;
}
function NativeForm({ block, tripId, onResult, disabled }: { block: MobileBlock; tripId?: string; onResult: (r: MobileCommandResult) => Promise<void>; disabled: boolean }) {
  const spec = block.form!;
  const defaults = () => formDefaults(spec.fields, spec.values);
  const dirty = useRef(false);
  const [values, setValues] = useState<MobileValues>(defaults), [files, setFiles] = useState<PickedFile[]>([]), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false), [expanded, setExpanded] = useState(spec.fields.length <= 4 || ["create", "questions", "details", "booking", "expense"].includes(block.id));
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
      if (r.review) { await onResult(r); return; }
      setFiles([]); dirty.current = false;
      if (["chat", "ask"].includes(block.id)) setValues({ ...defaults(), clientId: Crypto.randomUUID() });
      if (spec.action === "packing.add" || spec.action === "task.add") setValues(defaults());
      await onResult(r);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save. Your entries are still here."); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 16 }}>
    {!expanded && <Button secondary disabled={disabled} onPress={() => setExpanded(true)}>{spec.label} · open form</Button>}
    {expanded && <><Fields fields={spec.fields} values={values} onChange={v => { dirty.current = true; setValues(v); }} disabled={busy || disabled} />
      {fileField && <View style={{ gap: 10 }}><T style={{ fontFamily: "InterSemibold" }}>{fileField.label}</T><View style={{ gap: 8 }}><Button secondary disabled={busy} onPress={() => void choose("camera")}>Take a photo</Button><Button secondary disabled={busy} onPress={() => void choose("photos")}>Choose photos</Button><Button secondary disabled={busy} onPress={() => void choose("files")}>Attach PDF or image</Button></View>{files.map((file, i) => <View key={`${file.uri}-${i}`} style={{ gap: 8 }}><T>{file.name}</T><Button secondary disabled={busy} onPress={() => setFiles(files.filter((_, at) => at !== i))}>Remove attachment</Button></View>)}
      {spec.upload === "expense" && files.length > 0 && <Button secondary busy={busy} onPress={async () => { setBusy(true); setError(null); try { const r = await uploadFiles(tripId!, "scan", {}, [files[0]]); if (r.scan) { const scan = r.scan; dirty.current = true; setValues(old => ({ ...old, ...(scan.merchant ? { description: scan.merchant } : {}), ...(scan.amount ? { amount: scan.amount } : {}), ...(scan.currency ? { currency: scan.currency } : {}), ...(scan.date ? { date: scan.date } : {}), category: scan.category })); setScanNote(["Review the extracted details before saving.", ...scan.warnings].join(" ")); } } catch (e) { setError(e instanceof Error ? e.message : "Could not scan this receipt."); } finally { setBusy(false); } }}>★ Scan first receipt</Button>}
      </View>}
      {scanNote && <Muted>{scanNote}</Muted>}{error && <ErrorNotice message={error} />}<Button busy={busy} disabled={disabled} onPress={() => void submit()}>{spec.label}</Button>
      {error && <Button secondary onPress={() => { dirty.current = false; setValues(defaults()); setError(null); }}>Reset to latest saved values</Button>}
    </>}
  </View>;
}
