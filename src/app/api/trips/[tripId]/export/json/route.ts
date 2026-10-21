import { exportTripJson } from "@/server/export";
import { noStore, withUser } from "@/server/api";

export async function GET(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return withUser(async (userId) => {
    const data = await exportTripJson(userId, tripId);
    return new Response(JSON.stringify(data, null, 2), { headers: { ...noStore, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="tripanize-trip-export.json"` } });
  });
}
