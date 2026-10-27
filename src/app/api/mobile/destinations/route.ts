import { mobileRead } from "@/server/mobile/api";
import { getMobileDestinations } from "@/server/mobile/service";
export async function GET(request: Request) { return mobileRead(request, getMobileDestinations); }
