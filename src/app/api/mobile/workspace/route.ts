import { mobileRead, mobileWrite } from "@/server/mobile/api";
import { workspace } from "@/server/mobile/workspace";
import { mobileCommand } from "@/server/mobile/commands";

export async function GET(request: Request) {
  return mobileRead(request, userId => workspace(userId, new URL(request.url).searchParams));
}
export async function POST(request: Request) {
  return mobileWrite(request, (userId, input, sessionId) => mobileCommand(userId, input, sessionId));
}
