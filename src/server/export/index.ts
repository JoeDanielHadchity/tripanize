import { currentRuntime } from "@/server/cloudflare/runtime";
import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";
import { getTripPlan } from "@/server/plans/access";
import { effectiveStop, stopInclude } from "@/server/itinerary/service";
import { directionsUrl, type MapsApp } from "@/lib/maps";
import { daysBetween, formatDate, formatDateRange, formatDuration } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PDF_FONT_FILES, renderTripGuide } from "./pdf";

/** Full-trip JSON export of everything the member can see (other members' personal packing lists excluded). */
export async function exportTripJson(userId: string, tripId: string) {
  await requireTrip(tripId, userId, "view");
  const { premium } = await getTripPlan(tripId);
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: {
      destinations: { orderBy: { position: "asc" } },
      places: true,
      travelers: true,
      memberships: { select: { role: true, traveler: { select: { name: true } } } },
      days: { orderBy: { date: "asc" }, include: { stops: { include: stopInclude, orderBy: { position: "asc" } } } },
      stops: { where: { dayId: null } },
      bookings: { include: { attachments: { select: { fileName: true, mimeType: true, sizeBytes: true } } } },
      expenses: { where: { deletedAt: null, ...(!premium ? { id: "" } : {}) }, include: { shares: true } },
      settlements: { where: { deletedAt: null, ...(!premium ? { id: "" } : {}) } },
      tasks: true,
      events: { where: !premium ? { id: "" } : {}, include: { sources: true } },
      packingItems: { where: { dismissed: false, OR: [{ ownerId: null }, { ownerId: userId }] } },
    },
  });
  const { stops: ideas, ...rest } = trip;
  return { exportedAt: new Date().toISOString(), format: "tripanize-trip-export/v1", trip: { ...rest, unscheduledIdeas: ideas } };
}

async function pdfFonts() {
  const assets = currentRuntime().assets;
  if (!assets) throw new Error("PDF font assets are unavailable.");
  return Promise.all(PDF_FONT_FILES.map(async (name) => {
    const response = await assets.fetch(new Request(`https://assets/fonts/${name}`));
    if (!response.ok) throw new Error("Could not load PDF fonts.");
    return Buffer.from(await response.arrayBuffer());
  }));
}

/** PDF export uses browser-compatible libraries and static font assets, without a filesystem. */
export async function exportTripPdf(userId: string, tripId: string, opts: { date?: string | null; mapsApp?: MapsApp }) {
  await requireTrip(tripId, userId, "view");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { destinations: { orderBy: { position: "asc" } } } });
  const days = await prisma.itineraryDay.findMany({ where: { tripId, ...(opts.date ? { date: opts.date } : {}) }, orderBy: { date: "asc" }, include: { destination: true, stops: { include: stopInclude, orderBy: { position: "asc" } } } });
  const bookings = await prisma.booking.findMany({ where: { tripId, status: { in: ["BOOKED", "PAID", "REQUESTED"] }, ...(opts.date ? { date: opts.date } : {}) }, orderBy: [{ date: "asc" }, { startTime: "asc" }] });
  return renderTripGuide({
    name: trip.name,
    dates: opts.date ? formatDate(opts.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : formatDateRange(trip.startDate, trip.endDate),
    destinations: trip.destinations.map((d) => d.name).join(" / "),
    singleDay: Boolean(opts.date),
    days: days.map((day, i) => ({
      number: trip.startDate ? daysBetween(trip.startDate, day.date) + 1 : i + 1,
      date: formatDate(day.date, { weekday: "short", day: "numeric", month: "short" }),
      title: day.title || formatDate(day.date, { weekday: "long", day: "numeric", month: "long" }),
      subtitle: [day.destination?.name, day.area].filter(Boolean).join(" / "),
      labels: [day.isTravelDay ? "Travel day" : null, `Plan ${day.activePlan}`].filter((s): s is string => Boolean(s)),
      stops: day.stops.filter((s) => s.plan === day.activePlan && s.status !== "SKIPPED").map((stop) => {
        const e = effectiveStop(stop);
        const directions = directionsUrl(e, opts.mapsApp ?? "GOOGLE");
        return {
          title: e.title,
          time: e.startTime ?? "Anytime",
          tag: stop.booking ? (["BOOKED", "PAID"].includes(stop.booking.status) ? "Booked" : `Booking: ${stop.booking.status.toLowerCase().replace(/_/g, " ")}`) : stop.isFixed ? "Fixed" : stop.status === "SUGGESTED" ? "Suggestion" : undefined,
          details: [e.durationMin ? formatDuration(e.durationMin) : null, e.estCostMinor ? `Est. ${formatMoney(e.estCostMinor, e.currency ?? trip.currency)}` : null, stop.travelToNextMin ? `Next: ~${stop.travelToNextMin} min ${stop.travelMode?.toLowerCase() ?? "travel"}` : null].filter(Boolean).join(" / "),
          address: e.address,
          notes: [stop.hoursNote, stop.bookingNote && !stop.booking ? `Booking advice: ${stop.bookingNote}` : null].filter((n): n is string => Boolean(n)),
          links: [...(directions ? [{ label: "Directions", url: directions }] : []), ...(e.officialUrl ? [{ label: "Official website", url: e.officialUrl }] : [])],
        };
      }),
      notes: day.notes,
      questions: day.questions,
    })),
    bookings: bookings.map((b) => ({
      title: b.title,
      when: `${b.date ? formatDate(b.date) : "Date not set"}${b.startTime ? ` / ${b.startTime}` : ""}`,
      status: b.status.toLowerCase().replace(/_/g, " "),
      address: b.address,
      url: b.bookingUrl,
    })),
  }, await pdfFonts());
}
