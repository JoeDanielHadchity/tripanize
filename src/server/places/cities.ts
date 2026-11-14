import { currentRuntime } from "@/server/cloudflare/runtime";

// Cities and towns of 5,000+ people from GeoNames (CC BY 4.0), plus well-known small destinations:
// [name, country, population, alias]. Built by scripts/build-cities.mjs into public/data/cities.json.
// The list is 1.6 MB, so it ships as a static file and is loaded once per server instance instead of
// living in the code bundle.
type Row = [string, string, number, string];
export type City = { name: string; country: string; label: string };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
type Indexed = { name: string; country: string; population: number; k: { name: string; alias: string; country: string } };

let loading: Promise<Indexed[]> | null = null;
async function loadRows(): Promise<Indexed[]> {
  const assets = currentRuntime().assets;
  if (!assets) throw new Error("City list unavailable.");
  const response = await assets.fetch(new Request("https://assets/data/cities.json"));
  if (!response.ok) throw new Error(`City list unavailable (${response.status}).`);
  return indexCities(await response.json() as Row[]);
}

export function indexCities(rows: Row[]): Indexed[] {
  return rows.map(([name, country, population, alias]) => ({ name, country, population, k: { name: fold(name), alias: fold(alias), country: fold(country) } }));
}

async function cities() {
  loading ??= loadRows().catch(error => { loading = null; throw error; });
  return loading;
}

export const cityLabel = (c: { name: string; country: string }) => `${c.name}, ${c.country}`;

/** "lis" → Lisbon, Portugal first; "paris" → Paris, France before Paris, Texas. Bigger places first. */
export function rankCities(rows: Indexed[], query: string, limit = 8): City[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const words = q.split(" ");
  const hits: { r: Indexed; score: number }[] = [];
  for (const r of rows) {
    const names = `${r.k.name} ${r.k.alias}`;
    // Every word must match the name or alias; a trailing word may also match the country ("paris fr").
    if (!words.every((w, i) => names.includes(w) || (i > 0 && r.k.country.startsWith(w)))) continue;
    const exact = r.k.name === q || r.k.alias === q;
    const prefix = r.k.name.startsWith(q) || r.k.alias.startsWith(q);
    const wordStart = !prefix && (` ${names}`).includes(` ${words[0]}`);
    const score = exact ? 0 : prefix ? 1 : wordStart ? 2 : 3;
    hits.push({ r, score });
  }
  // Rows are stored biggest first, so a stable sort keeps population order within each score.
  hits.sort((a, b) => a.score - b.score || b.r.population - a.r.population);
  const seen = new Set<string>();
  const out: City[] = [];
  for (const { r } of hits) {
    const label = cityLabel(r);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ name: r.name, country: r.country, label });
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchCities(query: string, limit = 8) {
  return rankCities(await cities(), query, limit);
}
