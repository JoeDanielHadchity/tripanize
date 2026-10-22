import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { guideText, PDF_FONT_FILES, renderTripGuide } from "@/server/export/pdf";
import { tripGuideFixture } from "../fixtures/trip-guide";

const fonts = PDF_FONT_FILES.map((name) => readFileSync(`public/fonts/${name}`));
describe("branded travel guide", () => {
  it("provides accurate internal day links and safe, clickable booking and directions links", async () => {
    const guide = tripGuideFixture();
    guide.days[0].stops[0].links.push({ label: "Unsafe", url: "javascript:alert(1)" });
    const pdf = await PDFDocument.load(await renderTripGuide(guide, fonts));
    expect(pdf.getTitle()).toBe("Trip to New York - Tripanize itinerary");
    expect(pdf.getAuthor()).toBe("Tripanize");
    const pages = pdf.getPages();
    expect(pages.length).toBeGreaterThanOrEqual(6);
    const destinations: string[] = [], urls: string[] = [];
    for (const page of pages) {
      const annotations = page.node.Annots();
      if (!annotations) continue;
      for (let i = 0; i < annotations.size(); i++) {
        const a = annotations.lookup(i, PDFDict);
        const destination = a.lookupMaybe(PDFName.of("Dest"), PDFArray);
        if (destination) destinations.push(destination.get(0).toString());
        const action = a.lookupMaybe(PDFName.of("A"), PDFDict);
        const uri = action?.lookupMaybe(PDFName.of("URI"), PDFString);
        if (uri) urls.push(uri.decodeText());
      }
    }
    expect(destinations).toHaveLength(4);
    expect(new Set(destinations).size).toBe(4);
    for (const ref of destinations) expect(pages.some((p) => p.ref.toString() === ref)).toBe(true);
    expect(urls).toContain("https://www.metmuseum.org/");
    expect(urls.some((url) => url.includes("maps/dir"))).toBe(true);
    expect(urls.every((url) => /^https?:\/\//.test(url))).toBe(true);
  });
  it("exports a single day without a cover or index and paginates long notes", async () => {
    const guide = tripGuideFixture();
    guide.singleDay = true; guide.bookings = []; guide.days = [guide.days[1]];
    const short = await PDFDocument.load(await renderTripGuide(guide, fonts));
    expect(short.getPageCount()).toBeLessThanOrEqual(2);
    guide.days[0].stops[0].notes = ["Long practical detail for this stop. ".repeat(300)];
    guide.days[0].notes = "Day notes remain available across pages. ".repeat(250);
    const long = await PDFDocument.load(await renderTripGuide(guide, fonts));
    expect(long.getPageCount()).toBeGreaterThan(short.getPageCount());
    expect(long.getPageCount()).toBeLessThan(15);
  });
  it("cleans model formatting while retaining readable source names", () => {
    expect(guideText("**Check** [Museum](https://example.com) — open. citeturn1search0")).toBe("Check Museum - open.");
    expect(guideText("## A day\nCôte d’Azur")).toBe("A day\nCôte d’Azur");
  });
});
