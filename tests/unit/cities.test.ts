import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { indexCities, rankCities } from "@/server/places/cities";

const rows = indexCities(JSON.parse(readFileSync("public/data/cities.json", "utf8")));
const top = (q: string) => rankCities(rows, q)[0]?.label;

describe("city search", () => {
  it("finds big cities first", () => {
    expect(top("beirut")).toBe("Beirut, Lebanon");
    expect(top("paris")).toBe("Paris, France");
    expect(top("london")).toBe("London, United Kingdom");
    expect(top("riyadh")).toBe("Riyadh, Saudi Arabia");
    expect(top("lis")).toBe("Lisbon, Portugal");
  });
  it("ignores accents and finds English names", () => {
    expect(top("zurich")).toBe("Zürich, Switzerland");
    expect(top("krakow")).toBe("Kraków, Poland");
    expect(top("seville")).toBe("Seville, Spain");
    expect(top("sevilla")).toBe("Seville, Spain");
  });
  it("includes small well-known destinations", () => {
    expect(top("jounieh")).toBe("Jounieh, Lebanon");
    expect(top("byblos")).toBe("Byblos, Lebanon");
    expect(top("santorini")).toBe("Santorini, Greece");
    expect(top("alula")).toBe("AlUla, Saudi Arabia");
  });
  it("needs 2 letters, returns at most 8, no districts", () => {
    expect(rankCities(rows, "b")).toEqual([]);
    expect(rankCities(rows, "san").length).toBe(8);
    expect(rankCities(rows, "zurich").some(c => c.name.includes("("))).toBe(false);
  });
});
