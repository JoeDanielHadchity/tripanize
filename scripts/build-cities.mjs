// Rebuilds public/data/cities.json, the city list behind "Where are you going?".
//   npm i --no-save all-the-cities@3.1.0 countries-list@3.4.1 && node scripts/build-cities.mjs
// Source: GeoNames (CC BY 4.0) through all-the-cities. Keeps places of 5,000+ people and every
// capital, plus well-known small destinations and English names the data spells differently.
// Rows: [name, country, population, alias] (alias "" when none).
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const cities = require("all-the-cities");
const { countries } = require("countries-list");

const country = cc => countries[cc]?.name ?? cc;
// English names travelers type, for places GeoNames lists under the local name: [shown name, local name, country code].
const ALIASES = [["Seville", "Sevilla", "ES"], ["Antwerp", "Antwerpen", "BE"], ["Lucerne", "Luzern", "CH"], ["Bruges", "Brugge", "BE"], ["Ghent", "Gent", "BE"], ["Florence", "Firenze", "IT"]];
// Small or region-like destinations people plan trips to: [name, country code, rough population].
const EXTRA = [["Byblos", "LB", 40000], ["Batroun", "LB", 10000], ["Petra", "JO", 30000], ["AlUla", "SA", 40000], ["Hallstatt", "AT", 800], ["Positano", "IT", 4000], ["Amalfi", "IT", 5000], ["Zermatt", "CH", 6000], ["Santorini", "GR", 15000], ["Mykonos", "GR", 10000], ["Cappadocia", "TR", 50000], ["Cinque Terre", "IT", 4000], ["Lake Como", "IT", 80000], ["Bali", "ID", 4000000], ["Maldives", "MV", 500000], ["Hvar", "HR", 4000], ["Lake Bled", "SI", 5000], ["Faroe Islands", "FO", 50000]];

const byKey = new Map();
const add = (name, cc, population, alias = "") => {
  const key = `${name.toLowerCase()}|${cc}`;
  const old = byKey.get(key);
  if (!old || old[2] < population) byKey.set(key, [name, country(cc), population, alias]);
};
for (const c of cities) {
  const capital = c.featureCode === "PPLC";
  if (c.population < 5000 && !capital) continue;
  if (c.featureCode === "PPLX" || c.name.includes("(")) continue; // districts of a bigger city, like "Zürich (Kreis 3)"
  add(c.name, c.country, capital ? Math.max(c.population, 1_000_000) : c.population);
}
for (const [name, local, cc] of ALIASES) {
  const row = byKey.get(`${local.toLowerCase()}|${cc}`);
  if (row) { byKey.delete(`${local.toLowerCase()}|${cc}`); add(name, cc, row[2], local); }
}
for (const [name, cc, population] of EXTRA) add(name, cc, population);
const rows = [...byKey.values()].sort((a, b) => b[2] - a[2]);
writeFileSync(new URL("../public/data/cities.json", import.meta.url), JSON.stringify(rows));
console.log(rows.length, "cities");
