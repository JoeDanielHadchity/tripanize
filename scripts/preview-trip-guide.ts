import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PDF_FONT_FILES, renderTripGuide, type TripGuide } from "../src/server/export/pdf";
import { tripGuideFixture } from "../tests/fixtures/trip-guide";

const fonts = PDF_FONT_FILES.map((name) => readFileSync(`public/fonts/${name}`));
const sample = tripGuideFixture();
mkdirSync("tmp/pdfs", { recursive: true });
for (const [name, guide] of [
  ["trip-guide", sample],
  ["single-day", { ...sample, singleDay: true, days: [sample.days[1]], bookings: [] }],
  ["long-guide", { ...sample, days: Array.from({ length: 17 }, (_, i) => ({ ...sample.days[i % 3], number: i + 1 })) }],
  ["overflow", { ...sample, singleDay: true, bookings: [], days: [{ ...sample.days[1], stops: [{ ...sample.days[1].stops[3], title: "An extended visit through the collection of art, history and design", notes: ["A long practical note with helpful details for the visit. ".repeat(140) + "END OF STOP NOTE"] }], notes: "A useful day note. ".repeat(180) + "END OF DAY NOTE", questions: ["Côte d’Azur, Łódź, Αθήνα, Київ: are international names readable?", "Long reference: " + "ABCDEFGHIJKLMNOP".repeat(35)] }] }],
] satisfies [string, TripGuide][]) {
  const bytes = await renderTripGuide(guide, fonts);
  writeFileSync(`tmp/pdfs/${name}.pdf`, bytes);
  console.log(`${name}: ${bytes.length} bytes`);
}
