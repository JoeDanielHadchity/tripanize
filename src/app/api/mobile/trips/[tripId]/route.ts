import { mobileRead } from "@/server/mobile/api";
import { getMobileItinerary } from "@/server/mobile/service";
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return mobileRead(request, userId => getMobileItinerary(userId, tripId));
}
