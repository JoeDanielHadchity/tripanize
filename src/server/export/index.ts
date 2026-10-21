import path from "node:path";
import PDFDocument from "pdfkit";
import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";
import { effectiveStop, stopInclude } from "@/server/itinerary/service";
import { directionsUrl, type MapsApp } from "@/lib/maps";
import { formatDate, formatDateRange, formatDuration } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/** Full-trip JSON export of everything the member can see (other members' personal packing lists excluded). */
export async function exportTripJson(userId: string, tripId: string) {
  await requireTrip(tripId, userId, "view");
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
      expenses: { where: { deletedAt: null }, include: { shares: true } },
      settlements: { where: { deletedAt: null } },
      tasks: true,
      events: { include: { sources: true } },
      packingItems: { where: { dismissed: false, OR: [{ ownerId: null }, { ownerId: userId }] } },
    },
  });
  const { stops: ideas, ...rest } = trip;
  return { exportedAt: new Date().toISOString(), format: "tripanize-trip-export/v1", trip: { ...rest, unscheduledIdeas: ideas } };
}

const FONT = path.join(process.cwd(), "assets/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf");

/** PDF of one day (when `date` is set) or the whole trip, with bookings, addresses, directions and notes. */
export async function exportTripPdf(userId: string, tripId: string, opts: { date?: string | null; mapsApp?: MapsApp }) {
  await requireTrip(tripId, userId, "view");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { destinations: { orderBy: { position: "asc" } } } });
  const days = await prisma.itineraryDay.findMany({
    where: { tripId, ...(opts.date ? { date: opts.date } : {}) },
    orderBy: { date: "asc" },
    include: { destination: true, stops: { include: stopInclude, orderBy: { position: "asc" } } },
  });
  const bookings = await prisma.booking.findMany({ where: { tripId, status: { in: ["BOOKED", "PAID", "REQUESTED"] }, ...(opts.date ? { date: opts.date } : {}) }, orderBy: [{ date: "asc" }, { startTime: "asc" }] });

  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${trip.name} — Tripanize itinerary` } });
  doc.registerFont("body", FONT);
  doc.registerFont("bold", FONT_BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const ink = "#2a2522";
  const muted = "#6b625b";
  const accent = "#a84a2a";
  doc.font("bold").fontSize(20).fillColor(ink).text(trip.name);
  doc.font("body").fontSize(10).fillColor(muted).text(`${formatDateRange(trip.startDate, trip.endDate)} · ${trip.destinations.map((d) => d.name).join(" → ") || "No destinations yet"}`);
  doc.text(`Exported ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Times are local. Costs, travel times and opening hours are estimates unless marked verified.`);
  doc.moveDown();

  if (bookings.length) {
    doc.font("bold").fontSize(13).fillColor(accent).text(opts.date ? "Bookings this day" : "Key bookings");
    doc.font("body").fontSize(10).fillColor(ink);
    for (const b of bookings) {
      doc.text(`${b.date ? formatDate(b.date) : "Date not set"}${b.startTime ? ` ${b.startTime}` : ""} — ${b.title} (${b.status.toLowerCase()})${b.address ? ` · ${b.address}` : ""}`);
      if (b.bookingUrl) doc.fillColor(muted).text(b.bookingUrl, { link: b.bookingUrl, underline: false }).fillColor(ink);
    }
    doc.moveDown();
  }

  for (const d of days) {
    if (doc.y > 680) doc.addPage();
    doc.font("bold").fontSize(14).fillColor(ink).text(`${formatDate(d.date, { weekday: "long", day: "numeric", month: "long" })}${d.title ? ` — ${d.title}` : ""}`);
    doc.font("body").fontSize(9).fillColor(muted).text([d.destination?.name, d.area, d.isTravelDay ? "Travel day" : null, d.activePlan === "B" ? "Plan B active" : null].filter(Boolean).join(" · "));
    const stops = d.stops.filter((s) => s.plan === d.activePlan && s.status !== "SKIPPED");
    if (!stops.length) doc.fontSize(10).fillColor(muted).text("Nothing scheduled.");
    for (const s of stops) {
      const e = effectiveStop(s);
      if (doc.y > 720) doc.addPage();
      const tag = s.booking ? (s.booking.status === "BOOKED" || s.booking.status === "PAID" ? "Booked" : `Booking: ${s.booking.status.toLowerCase().replace("_", " ")}`) : s.isFixed ? "Fixed" : s.status === "SUGGESTED" ? "Suggestion" : "";
      doc.moveDown(0.3).font("bold").fontSize(11).fillColor(ink).text(`${e.startTime ?? "--:--"}  ${e.title}${tag ? `  [${tag}]` : ""}`);
      doc.font("body").fontSize(9).fillColor(ink);
      const meta = [e.durationMin ? formatDuration(e.durationMin) : null, e.estCostMinor ? `≈ ${formatMoney(e.estCostMinor, e.currency ?? trip.currency)}` : null, s.travelToNextMin ? `then ~${s.travelToNextMin} min ${s.travelMode ?? ""} to next (estimate)` : null].filter(Boolean).join(" · ");
      if (meta) doc.text(meta);
      if (e.address) doc.text(e.address);
      const dir = directionsUrl(e, opts.mapsApp ?? "GOOGLE");
      if (dir) doc.fillColor(accent).text("Directions", { link: dir }).fillColor(ink);
      if (e.officialUrl) doc.fillColor(muted).text(e.officialUrl, { link: e.officialUrl });
      if (s.hoursNote) doc.fillColor(muted).text(s.hoursNote);
      if (s.bookingNote && !s.booking) doc.fillColor(muted).text(`Booking advice: ${s.bookingNote}`);
      doc.fillColor(ink);
    }
    if (d.notes) doc.moveDown(0.4).font("bold").fontSize(10).text("Notes").font("body").fontSize(9).text(d.notes);
    if (d.questions.length) doc.font("bold").fontSize(10).text("Open questions").font("body").fontSize(9).text(d.questions.map((q) => `• ${q}`).join("\n"));
    doc.moveDown();
  }
  doc.end();
  return done;
}
