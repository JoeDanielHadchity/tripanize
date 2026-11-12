import data from "./airports.json";

// Airports with scheduled flights (OurAirports, public domain): [IATA, name, city, country, size],
// size 0 = large, 1 = medium, 2 = small. Built by scripts/build-airports.py.
type Row = [string, string, string, string, number];
export type Airport = { code: string; name: string; city: string; country: string; label: string };

// Major hubs come first when several airports match (OurAirports calls many airports "large").
const HUB_LIST = ("ATL DXB DFW LHR HND DEN IST LAX ORD DEL CDG JFK LAS AMS MIA MAD CAN ICN FRA SIN BOM PVG SFO CLT SEA MCO BKK PEK DOH SZX CTU EWR PHX IAH MUC BCN FCO SYD LGW YYZ CGK MEX SAW MNL BOS MSP DTW KUL HKG NRT KIX TPE LIS ZRH VIE CPH OSL ARN DUB BRU MAN PMI ATH AYT GRU BOG LIM SCL EZE JNB CAI RUH JED AUH SHJ KWI BAH MCT AMM BEY TLV MXP BER HAM DUS NCE MRS ORY GVA EDI STN OPO AGP ALC VCE NAP BLQ HEL WAW PRG BUD OTP SOF KEF YVR YUL SAN PHL BWI DCA IAD FLL TPA HNL MEL BNE AKL PER DPS HAN SGN CMB MLE BLR MAA HYD CCU KTM ISB LHE KHI ADD NBO LOS CMN RAK TUN ALG CPT DMM MED SKG HER LCA TBS EVN GYD ALA TAS DAC MLA SPU DBV").split(" ");
const HUBS = new Map(HUB_LIST.map((c, i) => [c, i])); // roughly busiest first
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const rows = (data as Row[]).map(([code, name, city, country, size]) => ({ code, name, city, country, size, k: { code: code.toLowerCase(), name: fold(name), city: fold(city), country: fold(country) } }));

/** The text saved in the trip: "Lisbon Humberto Delgado Airport (LIS), Lisbon". */
export const airportLabel = (a: { code: string; name: string; city: string }) => `${a.name} (${a.code})${a.city && !a.name.toLowerCase().includes(a.city.toLowerCase()) ? `, ${a.city}` : ""}`;

/** Search by code, city, airport name or country, like flight search sites: "lis", "Lisbon", "LIS". */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = fold(query.trim()).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2) return [];
  const words = q.split(" ");
  const scored: { r: (typeof rows)[number]; score: number }[] = [];
  for (const r of rows) {
    const all = `${r.k.code} ${r.k.city} ${r.k.name} ${r.k.country}`;
    if (!words.every(w => all.includes(w))) continue;
    const startsWord = (s: string) => s.startsWith(q) || s.includes(` ${q}`);
    const score = r.k.code === q ? 0 : r.k.city === q ? 1 : r.k.city.startsWith(q) ? 2 : startsWord(r.k.name) ? 3 : r.k.code.startsWith(q) ? 4 : r.k.country.startsWith(q) ? 6 : 5;
    // Then bigger airports, then ones named after the place searched (Dubai International before Al Maktoum).
    // Then major hubs, then bigger airports.
    scored.push({ r, score: score * 10 + (HUBS.has(r.code) ? -1 : r.size) });
  }
  scored.sort((a, b) => a.score - b.score || (HUBS.get(a.r.code) ?? 999) - (HUBS.get(b.r.code) ?? 999) || a.r.name.length - b.r.name.length);
  return scored.slice(0, limit).map(({ r }) => ({ code: r.code, name: r.name, city: r.city, country: r.country, label: airportLabel(r) }));
}
