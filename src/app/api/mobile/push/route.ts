import { mobileRead, mobileWrite } from "@/server/mobile/api";
import { changePush, getPushSettings } from "@/server/push/service";

export async function GET(request: Request) { return mobileRead(request, userId => getPushSettings(userId)); }
export async function POST(request: Request) { return mobileWrite(request, (userId, input) => changePush(userId, input)); }
