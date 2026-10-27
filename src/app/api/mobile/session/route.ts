import { mobileRead } from "@/server/mobile/api";
import { getMobileUser } from "@/server/mobile/service";
export async function GET(request: Request) { return mobileRead(request, getMobileUser); }
