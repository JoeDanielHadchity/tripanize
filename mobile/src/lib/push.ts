import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import type * as Notifications from "expo-notifications";
import { api, post } from "./auth";
import type { MobileTarget } from "./workspace";

export type PushCategory = "chat" | "events" | "group" | "reminders";
export type PushSettings = Record<PushCategory, boolean>;
export type PushState = { settings: PushSettings; devices: number };
export type PushPermission = "granted" | "denied" | "undetermined" | "unsupported";

export const PUSH_LABELS: Record<PushCategory, { title: string; text: string }> = {
  chat: { title: "Trip chat", text: "New messages from your group" },
  events: { title: "Events nearby", text: "Concerts, shows and festivals found for your trip" },
  group: { title: "Votes, invites & expenses", text: "New votes, decisions, people joining and shared costs" },
  reminders: { title: "Trip reminders", text: "The evening before you leave, and each morning's plan" },
};

const TOKEN_KEY = "tripanize-push-token";
// Native-only module; the web preview never loads it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const native = () => require("expo-notifications") as typeof Notifications;
export const pushSupported = () => Platform.OS !== "web" && Device.isDevice;
let configured = false;

/** Foreground banners and Android channels (one per category, so people can
 * also mute a kind in system settings). Safe to call more than once. */
export async function configurePush() {
  if (!pushSupported() || configured) return;
  configured = true;
  const N = native();
  N.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
  if (Platform.OS === "android") for (const [id, label] of Object.entries(PUSH_LABELS)) {
    await N.setNotificationChannelAsync(id, { name: label.title, description: label.text, importance: id === "chat" ? N.AndroidImportance.HIGH : N.AndroidImportance.DEFAULT, lightColor: "#3f6d83" });
  }
}

export async function pushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return "unsupported";
  const { status } = await native().getPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

async function register() {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await native().getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await post("/api/mobile/push", { op: "register", token, platform: Platform.OS, appVersion: Constants.expoConfig?.version });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return token;
}

/** Asks the system once (only when the person taps "Turn on"), then registers. */
export async function enablePush(): Promise<PushPermission> {
  if (!pushSupported()) return "unsupported";
  await configurePush();
  let status = await pushPermission();
  if (status === "undetermined") status = (await native().requestPermissionsAsync()).status === "granted" ? "granted" : "denied";
  if (status === "granted") await register();
  return status;
}

/** At start-up: refresh the token silently if permission was already given. */
export async function syncPush() {
  try {
    if (!pushSupported()) return;
    await configurePush();
    if (await pushPermission() === "granted") await register();
  } catch { /* the next launch tries again */ }
}

/** Before sign-out, so the next person on this phone does not get our alerts. */
export async function unregisterPush() {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) await post("/api/mobile/push", { op: "unregister", token });
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch { /* the server also replaces a token when someone else signs in */ }
}

export const loadPushSettings = () => api<PushState>("/api/mobile/push");
export const savePushSettings = (settings: Partial<PushSettings>) => post<PushState>("/api/mobile/push", { op: "settings", settings });

/** Server hrefs are website paths; map them to app screens. */
export function pushTarget(href: unknown): MobileTarget | null {
  if (typeof href !== "string") return null;
  if (/^\/trips\/?$/.test(href)) return { screen: "trips" };
  const match = /^\/trips\/([A-Za-z0-9_-]{1,64})\/([a-z]+)/.exec(href);
  if (!match) return null;
  const section = match[2] === "today" ? "packing" : match[2];
  return ["itinerary", "expenses", "chat", "events", "bookings", "packing", "settings", "votes", "premium"].includes(section) ? { screen: section, tripId: match[1] } : { screen: "itinerary", tripId: match[1] };
}

/** Calls `open` for the notification that launched the app and every later tap. */
export function onPushOpen(open: (target: MobileTarget) => void) {
  if (!pushSupported()) return () => {};
  const N = native();
  const handle = (response: Notifications.NotificationResponse | null) => {
    const target = pushTarget(response?.notification.request.content.data?.href);
    if (target) open(target);
  };
  void N.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
  const subscription = N.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}
