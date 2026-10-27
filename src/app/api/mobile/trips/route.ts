import { mobileRead } from "@/server/mobile/api";
import { getMobileTrips } from "@/server/mobile/service";
export async function GET(request: Request) { return mobileRead(request, getMobileTrips); }
