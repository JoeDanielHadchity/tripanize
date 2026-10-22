import { PDFDocument, PDFString, rgb, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { safeUrl } from "@/lib/maps";

export const PDF_FONT_FILES = ["Inter-Regular.ttf", "Inter-SemiBold.ttf", "Fraunces-SemiBold.ttf", "DejaVuSans.ttf", "DejaVuSans-Bold.ttf"] as const;

export type GuideLink = { label: string; url: string };
export type GuideStop = { title: string; time: string; tag?: string; details?: string; address?: string | null; notes: string[]; links: GuideLink[] };
export type GuideDay = { number: number; date: string; title: string; subtitle: string; labels: string[]; stops: GuideStop[]; notes?: string | null; questions: string[] };
export type GuideBooking = { title: string; when: string; status: string; address?: string | null; url?: string | null };
export type TripGuide = { name: string; dates: string; destinations: string; days: GuideDay[]; bookings: GuideBooking[]; singleDay: boolean; exportedAt?: Date };

const W = 595.28, H = 841.89, M = 44, RIGHT = W - M, CW = W - M * 2, BOTTOM = 776;
const hex = (v: string) => rgb(parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255);
const C = { ink: hex("13201f"), muted: hex("4f6563"), teal: hex("0f766e"), deep: hex("115e59"), mint: hex("d5efeb"), paper: hex("f1f7f6"), line: hex("d3e5e2"), coral: hex("c2553a"), peach: hex("fbe3da"), white: rgb(1, 1, 1) };
type Face = "body" | "bold" | "display";
type Line = { text: string; face: Face; size: number; color: RGB; leading: number; links?: GuideLink[] };

/** Human-readable prose, never raw Markdown or model citation control tokens. */
export function guideText(value: string) {
  return value.normalize("NFC").replace(/\r\n?/g, "\n")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/[^]*/g, "").replace(/\*\*|__|`/g, "")
    .replace(/^#{1,6}\s+/gm, "").replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u200b\ufe0f]/g, "").trim();
}

function sourceLinks(value: string): GuideLink[] {
  const links: GuideLink[] = [];
  for (const match of value.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
    const url = safeUrl(match[2]);
    if (url && !links.some((l) => l.url === url)) links.push({ label: `Source: ${new URL(url).hostname.replace(/^www\./, "")}`, url });
  }
  return links;
}

/** A filesystem-free renderer shared by the Worker export and visual fixtures. */
export async function renderTripGuide(guide: TripGuide, fontBytes: readonly Uint8Array[]) {
  if (fontBytes.length !== PDF_FONT_FILES.length) throw new Error("Trip guide fonts are incomplete.");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${guide.name} - Tripanize itinerary`);
  pdf.setAuthor("Tripanize");
  pdf.setSubject("Your trip itinerary and key bookings");
  pdf.setCreator("Tripanize · tripanize.app");
  const stamp = guide.exportedAt ?? new Date();
  pdf.setCreationDate(stamp);
  pdf.setModificationDate(stamp);
  const fonts = await Promise.all(fontBytes.map((bytes) => pdf.embedFont(bytes, { subset: true })));
  const sets = fonts.map((f) => new Set(f.getCharacterSet()));
  const fontIndex = (s: string, face: Face) => {
    const i = face === "display" ? 2 : face === "bold" ? 1 : 0;
    return Array.from(s).every((c) => sets[i].has(c.codePointAt(0)!)) ? i : face === "body" ? 3 : 4;
  };
  const clean = (s: string) => Array.from(guideText(s)).map((c) => c === "\n" || sets.some((set) => set.has(c.codePointAt(0)!)) ? c : "?").join("");
  const measure = (s: string, size: number, face: Face = "body") => fonts[fontIndex(s, face)].widthOfTextAtSize(s, size);
  function wrap(value: string, width: number, size: number, face: Face = "body") {
    const lines: string[] = [];
    for (const paragraph of clean(value).split("\n")) {
      let line = "";
      for (const word of paragraph.trim().split(/\s+/)) {
        if (!word) continue;
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate, size, face) <= width) { line = candidate; continue; }
        if (line) { lines.push(line); line = ""; }
        for (const ch of Array.from(word)) {
          if (line && measure(line + ch, size, face) > width) { lines.push(line); line = ""; }
          line += ch;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  function text(p: PDFPage, value: string, x: number, top: number, size = 10, face: Face = "body", color = C.ink) {
    const s = clean(value);
    p.drawText(s, { x, y: H - top - size, font: fonts[fontIndex(s, face)], size, color });
  }
  const rect = (p: PDFPage, x: number, top: number, width: number, height: number, color: RGB, borderColor?: RGB) =>
    p.drawRectangle({ x, y: H - top - height, width, height, color, ...(borderColor ? { borderColor, borderWidth: 0.6 } : {}) });
  const rule = (p: PDFPage, top: number, x = M, width = CW, color = C.line) => p.drawLine({ start: { x, y: H - top }, end: { x: x + width, y: H - top }, thickness: 0.7, color });
  function brand(p: PDFPage, top: number, large = false) {
    const r = large ? 15 : 10, cx = M + r, cy = H - top - r;
    p.drawCircle({ x: cx, y: cy, size: r, color: C.teal });
    const scale = r * 2 / 32;
    p.drawSvgPath("M8 21c3-7 6-10 8-10s3 3 8-2", { x: M, y: H - top, scale, borderColor: C.white, borderWidth: 2.4 });
    p.drawCircle({ x: M + 23.5 * scale, y: H - top - 9.5 * scale, size: 2.2 * scale, color: C.white });
    text(p, "Tripanize", M + r * 2 + 9, top - (large ? 0 : 2), large ? 25 : 18, "display", C.deep);
  }
  function urlLink(p: PDFPage, url: string, x: number, top: number, width: number, height: number) {
    const safe = safeUrl(url);
    if (!safe) return;
    p.node.addAnnot(pdf.context.register(pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [x, H - top - height, x + width, H - top], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(safe) } })));
  }
  function pageLink(p: PDFPage, target: PDFPage, top: number, height: number) {
    p.node.addAnnot(pdf.context.register(pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [M, H - top - height, RIGHT, H - top], Border: [0, 0, 0], Dest: [target.ref, "Fit"] })));
  }
  function fitLine(value: string, width: number, size: number, face: Face = "body") {
    const s = clean(value);
    if (measure(s, size, face) <= width) return s;
    let result = "";
    for (const ch of Array.from(s)) {
      if (measure(result + ch + "…", size, face) > width) break;
      result += ch;
    }
    return result + "…";
  }
  let page!: PDFPage;
  let y = 0;
  function newPage(section: string) {
    page = pdf.addPage([W, H]);
    brand(page, 29);
    const label = fitLine(section, 290, 8);
    text(page, label, RIGHT - measure(label, 8), 35, 8, "body", C.muted);
    rule(page, 66);
    y = 88;
    return page;
  }
  function linkLines(links: GuideLink[], width: number): Line[] {
    const lines: Line[] = [];
    let current: GuideLink[] = [], taken = 0;
    for (const link of links.filter((l) => safeUrl(l.url))) {
      const label = fitLine(link.label, width - 20, 8, "bold");
      const w = measure(label, 8, "bold") + 22;
      if (current.length && taken + w > width) { lines.push({ text: "", face: "bold", size: 8, color: C.teal, leading: 21, links: current }); current = []; taken = 0; }
      current.push({ ...link, label }); taken += w;
    }
    if (current.length) lines.push({ text: "", face: "bold", size: 8, color: C.teal, leading: 21, links: current });
    return lines;
  }
  const prose = (value: string, width: number, size = 9, face: Face = "body", color = C.muted, leading = 13): Line[] =>
    wrap(value, width, size, face).map((s) => ({ text: s, face, size, color, leading }));
  function paintLine(line: Line, x: number, top: number) {
    if (!line.links) { text(page, line.text, x, top, line.size, line.face, line.color); return; }
    let left = x;
    for (const link of line.links) {
      const w = measure(link.label, 8, "bold") + 16;
      rect(page, left, top, w, 16, C.mint);
      text(page, link.label, left + 8, top + 3, 8, "bold", C.deep);
      urlLink(page, link.url, left, top, w, 16);
      left += w + 6;
    }
  }
  function heading(label: string, title: string, subtitle?: string) {
    text(page, label.toUpperCase(), M, y, 8, "bold", C.teal); y += 22;
    for (const line of wrap(title, CW, 27, "display")) { text(page, line, M, y, 27, "display"); y += 33; }
    if (subtitle) { y += 4; for (const line of wrap(subtitle, CW, 9)) { text(page, line, M, y, 9, "body", C.muted); y += 14; } }
    y += 14;
  }
  function continueSection(label: string) {
    newPage(guide.name);
    text(page, label, M, y, 16, "display", C.deep); y += 31;
  }
  function panel(title: string, content: string, continuation: () => void, tint = C.paper, actions: GuideLink[] = []) {
    const lines = prose(content, CW - 28, 9, "body", C.muted, 14);
    const links = linkLines([...actions, ...sourceLinks(content)], CW - 28);
    const queue: Line[] = [...lines, ...links];
    let continued = false;
    while (queue.length) {
      const titleLines = prose(title + (continued ? " (continued)" : ""), CW - 28, 10, "bold", C.deep, 14);
      const headerHeight = 20 + titleLines.length * 14;
      const min = headerHeight + Math.min(3, queue.length) * 14 + 10;
      if (y + min > BOTTOM) continuation();
      const start = y;
      let used = headerHeight, count = 0;
      while (count < queue.length && y + used + queue[count].leading + 12 <= BOTTOM) used += queue[count++].leading;
      if (!count) throw new Error("PDF panel has no room for text.");
      rect(page, M, start, CW, used + 10, tint);
      rect(page, M, start, 3, used + 10, C.teal);
      titleLines.forEach((line, i) => paintLine(line, M + 14, start + 11 + i * 14));
      let top = start + headerHeight;
      for (const line of queue.splice(0, count)) { paintLine(line, M + 14, top); top += line.leading; }
      y = start + used + 22; continued = true;
    }
  }

  const dayStarts: PDFPage[] = [];
  const contents: { page: PDFPage; days: GuideDay[] }[] = [];
  if (!guide.singleDay) {
    page = pdf.addPage([W, H]);
    rect(page, 0, 0, W, H, C.paper);
    rect(page, W - 18, 0, 18, H, C.teal);
    brand(page, 44, true);
    text(page, "YOUR TRAVEL GUIDE", M, 130, 9, "bold", C.teal);
    let titleSize = 45;
    while (titleSize > 22 && wrap(guide.name, CW - 15, titleSize, "display").length > 4) titleSize -= 1;
    y = 162;
    for (const line of wrap(guide.name, CW - 15, titleSize, "display")) {
      // Extremely long names continue on the overview, keeping the cover balanced.
      if (y + titleSize > 392) break;
      text(page, line, M, y, titleSize, "display", C.ink); y += titleSize * 1.13;
    }
    y = Math.max(325, y + 24);
    text(page, clean(guide.dates), M, y, 13, "bold", C.deep); y += 27;
    for (const line of wrap(guide.destinations || "Your next adventure", CW - 20, 12).slice(0, 3)) { text(page, line, M, y, 12, "body", C.muted); y += 18; }
    const statsTop = Math.max(432, y + 26), tile = (CW - 24) / 3;
    for (const [i, stat] of [[String(guide.days.length), "DAYS TO EXPLORE"], [String(guide.days.reduce((n, d) => n + d.stops.length, 0)), "PLANNED STOPS"], [String(guide.bookings.length), "KEY BOOKINGS"]].entries()) {
      const x = M + i * (tile + 12);
      rect(page, x, statsTop, tile, 83, C.white);
      text(page, stat[0], x + 16, statsTop + 12, 29, "display", i === 2 ? C.coral : C.teal);
      text(page, stat[1], x + 16, statsTop + 57, 7.1, "bold", C.muted);
    }
    const routeTop = statsTop + 116;
    // A vector route echoes the real Tripanize mark, remaining crisp in print.
    page.drawSvgPath("M0 62 C75 -5 125 113 202 48 S335 108 451 4", { x: M + 10, y: H - routeTop, borderColor: C.teal, borderWidth: 2, opacity: 0.65 });
    for (const [x, top, color] of [[M + 10, routeTop + 62, C.teal], [M + 212, routeTop + 48, C.teal], [M + 461, routeTop + 4, C.coral]] as const) {
      page.drawCircle({ x, y: H - top, size: 5, color: C.paper, borderColor: color, borderWidth: 2 });
    }
    text(page, "A little less planning.", M, 690, 20, "display", C.deep);
    text(page, "A lot more going.", M, 718, 20, "display", C.deep);
    for (let i = 0; i < guide.days.length; i += 14) contents.push({ page: newPage("Your trip at a glance"), days: guide.days.slice(i, i + 14) });
  }

  for (const day of guide.days) {
    dayStarts.push(newPage(guide.name));
    const continueDay = () => continueSection(`Day ${day.number} · ${day.date} · continued`);
    heading(`Day ${String(day.number).padStart(2, "0")} / ${day.date}`, day.title, day.subtitle);
    const labels = [...day.labels, `${day.stops.length} ${day.stops.length === 1 ? "stop" : "stops"}`].join("   /   ");
    for (const line of wrap(labels, CW, 8, "bold")) { text(page, line, M, y - 3, 8, "bold", C.teal); y += 13; }
    y += 12;
    for (const stop of day.stops) {
      const x = M + 72, bodyWidth = CW - 86;
      const title = prose(stop.title, bodyWidth, 11, "bold", C.ink, 15);
      const lines: Line[] = [...title];
      if (stop.tag) lines.push(...prose(stop.tag.toUpperCase(), bodyWidth, 7.2, "bold", C.coral, 13));
      if (stop.details) lines.push(...prose(stop.details, bodyWidth, 8.5, "body", C.muted, 13));
      if (stop.address) lines.push(...prose(stop.address, bodyWidth, 8.5, "body", C.muted, 13));
      for (const note of stop.notes) lines.push(...prose(note, bodyWidth, 8.5, "body", C.muted, 13));
      lines.push(...linkLines([...stop.links, ...stop.notes.flatMap(sourceLinks)], bodyWidth));
      let continued = false;
      while (lines.length) {
        const full = lines.reduce((n, l) => n + l.leading, 0) + 19;
        // Keep ordinary stops together. Oversized notes flow onto a continued card.
        const minimum = Math.min(full, Math.max(100, title.length * 15 + 42));
        if (y + minimum > BOTTOM || (full <= 550 && y + full > BOTTOM)) continueDay();
        const start = y;
        const repeat = continued ? prose(`${stop.title} (continued)`, bodyWidth, 9, "bold", C.deep, 13) : [];
        let used = 10 + repeat.length * 13, count = 0;
        while (count < lines.length && y + used + lines[count].leading + 9 <= BOTTOM) used += lines[count++].leading;
        if (!count) throw new Error("PDF stop has no room for text.");
        rect(page, M, start, CW, used + 9, C.white, C.line);
        rect(page, M, start, 57, used + 9, C.paper);
        text(page, stop.time || "Anytime", M + 9, start + 13, 10, "bold", C.deep);
        text(page, continued ? "CONT." : "LOCAL", M + 9, start + 29, 6.4, "bold", C.muted);
        let top = start + 10;
        for (const line of [...repeat, ...lines.splice(0, count)]) { paintLine(line, x, top); top += line.leading; }
        y = start + used + 17;
        continued = true;
      }
    }
    if (!day.stops.length) panel("Room to explore", "Nothing scheduled yet. Leave space for a slow morning, a local discovery or a change of plan.", continueDay);
    if (day.notes) { y += 5; panel("Good to know", day.notes, continueDay); }
    if (day.questions.length) panel("Still to decide", day.questions.map((q) => `• ${q}`).join("\n"), continueDay, C.peach);
  }

  let bookingsPage: PDFPage | undefined;
  if (guide.bookings.length) {
    bookingsPage = newPage(guide.name);
    heading("Keep these handy", guide.singleDay ? "Bookings for the day" : "Your key bookings", "Booked, paid and requested reservations. Check the latest details with the provider.");
    const cont = () => continueSection("Your key bookings · continued");
    for (const b of guide.bookings) {
      const body = [b.when, `Status: ${b.status}`, b.address].filter(Boolean).join("\n");
      panel(b.title, body, cont, C.paper, b.url ? [{ label: "Open booking", url: b.url }] : []);
    }
  }
  if (!pdf.getPageCount()) { newPage(guide.name); heading("Your itinerary", guide.name, guide.dates); panel("A trip starts here", "Add days and stops in Tripanize, then export your guide again.", () => continueSection("Your itinerary")); }

  // Fill the clickable contents after pagination, so all folios are accurate.
  let dayIndex = 0;
  for (const chunk of contents) {
    page = chunk.page; y = 88;
    heading("The journey ahead", "Your trip at a glance", guide.dates);
    for (const day of chunk.days) {
      const top = y, target = dayStarts[dayIndex++];
      const titleLines = wrap(day.title, CW - 164, 9.5, "bold");
      const rowHeight = Math.max(33, 16 + titleLines.length * 12);
      // Long titles retain their full text on the day's own page.
      text(page, String(day.number).padStart(2, "0"), M, top + 2, 15, "display", C.teal);
      text(page, day.date, M + 35, top + 6, 8, "body", C.muted);
      for (const [i, line] of titleLines.slice(0, 2).entries()) text(page, line, M + 114, top + 3 + i * 12, 9.5, "bold");
      const folio = String(pdf.getPages().indexOf(target) + 1);
      text(page, folio, RIGHT - measure(folio, 9, "bold"), top + 5, 9, "bold", C.teal);
      rule(page, top + Math.min(41, rowHeight) - 5); pageLink(page, target, top, Math.min(41, rowHeight));
      y += Math.min(41, rowHeight);
    }
    if (bookingsPage && y + 38 < BOTTOM) {
      y += 12; text(page, "Your key bookings", M, y, 10, "bold", C.deep);
      const folio = String(pdf.getPages().indexOf(bookingsPage) + 1);
      text(page, folio, RIGHT - measure(folio, 9, "bold"), y, 9, "bold", C.teal); pageLink(page, bookingsPage, y - 2, 23);
      y += 29;
    }
    if (y + 65 < BOTTOM) {
      y += 16;
      panel("Made for the way you travel", "Each day starts on its own page. Tap a day above to jump there, or use the links beside a stop for directions and official information.", () => continueSection("Your trip at a glance"));
    }
  }
  const exported = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(stamp);
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    rule(p, 795);
    text(p, `TRIPANIZE  /  Exported ${exported}`, M, 808, 7, "bold", C.muted);
    const folio = `${String(i + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`;
    text(p, folio, RIGHT - measure(folio, 7, "bold"), 808, 7, "bold", C.teal);
    if (i > 0 || guide.singleDay) text(p, "Times are local. Costs, travel times and hours are estimates unless verified.", M, 780, 6.5, "body", C.muted);
    urlLink(p, "https://tripanize.app", M, 805, 55, 14);
  });
  return Buffer.from(await pdf.save());
}
