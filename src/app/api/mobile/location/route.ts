import { z } from "zod";
import { mobileRead, mobileWrite } from "@/server/mobile/api";
import { getLocationSelf, changeMemberLocation } from "@/server/locations/service";
const trip = (request: Request) => z.string().min(1).max(64).parse(new URL(request.url).searchParams.get("tripId"));
export async function GET(request: Request) { return mobileRead(request, userId => getLocationSelf(userId, trip(request))); }
export async function POST(request: Request) { return mobileWrite(request, (userId, input) => changeMemberLocation(userId, trip(request), input)); }
