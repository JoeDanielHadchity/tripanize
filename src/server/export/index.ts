import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { currentRuntime } from "@/server/cloudflare/runtime";
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

async function pdfFonts() {
  const assets = currentRuntime().assets;
  if (!assets) throw new Error("PDF font assets are unavailable.");
  return Promise.all(["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"].map(async (name) => {
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
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${trip.name} — Tripanize itinerary`);
  const [regularBytes, boldBytes] = await pdfFonts();
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const ink = rgb(0.075, 0.125, 0.122), muted = rgb(0.31, 0.396, 0.388), accent = rgb(0.059, 0.463, 0.431);
  const margin = 48, width = 595.28, height = 841.89, available = width - margin * 2;
  let page: PDFPage = pdf.addPage([width, height]);
  let y = height - margin;
  function write(value: string, options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number; link?: string } = {}) {
    const font = options.font ?? regular, size = options.size ?? 9;
    const chars = new Set(font.getCharacterSet());
    const text = Array.from(value).map((c) => c === "\n" || chars.has(c.codePointAt(0)!) ? c : "?").join("");
    y -= options.gap ?? 0;
    for (const paragraph of text.split("\n")) {
      const lines: string[] = [];
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= available) { line = candidate; continue; }
        if (line) { lines.push(line); line = ""; }
        for (const c of word) {
          if (line && font.widthOfTextAtSize(line + c, size) > available) { lines.push(line); line = ""; }
          line += c;
        }
      }
      lines.push(line);
      for (const part of lines) {
        if (y - size < margin) { page = pdf.addPage([width, height]); y = height - margin; }
        y -= size;
        page.drawText(part, { x: margin, y, font, size, color: options.color ?? ink });
        if (options.link && part) {
          const annotation = pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [margin, y - 2, margin + font.widthOfTextAtSize(part, size), y + size], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(options.link) } });
          page.node.addAnnot(pdf.context.register(annotation));
        }
        y -= size * 0.4;
      }
    }
  }
  write(trip.name, { font: bold, size: 20 });
  write(`${formatDateRange(trip.startDate, trip.endDate)} · ${trip.destinations.map((d) => d.name).join(" → ") || "No destinations yet"}`, { size: 10, color: muted, gap: 5 });
  write(`Exported ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Times are local. Costs, travel times and opening hours are estimates unless marked verified.`, { color: muted });
  if (bookings.length) {
    write(opts.date ? "Bookings this day" : "Key bookings", { font: bold, size: 13, color: accent, gap: 14 });
    for (const b of bookings) {
      write(`${b.date ? formatDate(b.date) : "Date not set"}${b.startTime ? ` ${b.startTime}` : ""} — ${b.title} (${b.status.toLowerCase()})${b.address ? ` · ${b.address}` : ""}`);
      if (b.bookingUrl) write(b.bookingUrl, { color: accent, link: b.bookingUrl });
    }
  }
  for (const day of days) {
    if (y < margin + 80) { page = pdf.addPage([width, height]); y = height - margin; }
    write(`${formatDate(day.date, { weekday: "long", day: "numeric", month: "long" })}${day.title ? ` — ${day.title}` : ""}`, { font: bold, size: 14, gap: 18 });
    write([day.destination?.name, day.area, day.isTravelDay ? "Travel day" : null, day.activePlan === "B" ? "Plan B active" : null].filter(Boolean).join(" · "), { color: muted });
    const stops = day.stops.filter((s) => s.plan === day.activePlan && s.status !== "SKIPPED");
    if (!stops.length) write("Nothing scheduled.", { color: muted });
    for (const stop of stops) {
      const e = effectiveStop(stop);
      const tag = stop.booking ? (["BOOKED", "PAID"].includes(stop.booking.status) ? "Booked" : `Booking: ${stop.booking.status.toLowerCase().replace("_", " ")}`) : stop.isFixed ? "Fixed" : stop.status === "SUGGESTED" ? "Suggestion" : "";
      write(`${e.startTime ?? "--:--"}  ${e.title}${tag ? `  [${tag}]` : ""}`, { font: bold, size: 11, gap: 6 });
      const details = [e.durationMin ? formatDuration(e.durationMin) : null, e.estCostMinor ? `≈ ${formatMoney(e.estCostMinor, e.currency ?? trip.currency)}` : null, stop.travelToNextMin ? `then ~${stop.travelToNextMin} min ${stop.travelMode ?? ""} to next (estimate)` : null].filter(Boolean).join(" · ");
      if (details) write(details);
      if (e.address) write(e.address);
      const directions = directionsUrl(e, opts.mapsApp ?? "GOOGLE");
      if (directions) write("Directions", { color: accent, link: directions });
      if (e.officialUrl) write(e.officialUrl, { color: muted, link: e.officialUrl });
      if (stop.hoursNote) write(stop.hoursNote, { color: muted });
      if (stop.bookingNote && !stop.booking) write(`Booking advice: ${stop.bookingNote}`, { color: muted });
    }
    if (day.notes) write(`Notes: ${day.notes}`, { gap: 6 });
    if (day.questions.length) write(`Open questions\n${day.questions.map((q) => `• ${q}`).join("\n")}`, { gap: 6 });
  }
  return Buffer.from(await pdf.save());
}
