import { mobileRead } from "@/server/mobile/api";
import { getMobileUser } from "@/server/mobile/service";
import { unreadChangeNotifications } from "@/server/notifications/changes";
/** The signed-in person plus the inbox badge count for the app's tab bar. */
export async function GET(request: Request) { return mobileRead(request, async userId => ({ ...(await getMobileUser(userId)), unread: await unreadChangeNotifications(userId) })); }
