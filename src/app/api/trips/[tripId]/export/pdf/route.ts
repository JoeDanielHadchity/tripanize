import { exportTripPdf } from "@/server/export";
import { getProfile } from "@/server/profile";
import { noStore, withUser } from "@/server/api";
import { isDateStr } from "@/lib/dates";

export async function GET(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const date = new URL(req.url).searchParams.get("date");
  return withUser(async (userId) => {
    const { profile } = await getProfile(userId);
    const pdf = await exportTripPdf(userId, tripId, { date: date && isDateStr(date) ? date : null, mapsApp: profile.mapsApp });
    return new Response(new Uint8Array(pdf), {
      headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="roam-${date ?? "trip"}.pdf"` },
    });
  });
}
