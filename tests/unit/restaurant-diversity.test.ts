import { describe, expect, it } from "vitest";
import { RestaurantRegistry, restaurantRefs, sourceSites, uniqueMealOptions } from "@/lib/restaurant-diversity";
import type { RestaurantOption } from "@/lib/meal-options";

const option = (name: string, officialUrl: string | null = null): RestaurantOption => ({ name, officialUrl, sourceUrls: ["https://guide.example/food"], cuisine: "Local", area: "Old town", address: null, whyFits: "Matches the food preferences", pricePerPerson: null, hoursNote: null });

describe("trip-wide restaurant identity", () => {
  it("rejects accent, punctuation, meal-label, branch and website aliases across meals and dates", () => {
    const used = new RestaurantRegistry();
    const first = uniqueMealOptions({ breakfast: [option("Café L’Orient", "https://www.orient.example/menu/?utm_source=ad")], lunch: [option("Dinner at Cafe L'Orient"), option("A different place")] }, used);
    const next = uniqueMealOptions({ dinner: [option("L'Orient Restaurant"), option("Other alias", "http://orient.example/menu#top"), option("A different place – New branch"), option("New dinner")] }, used);
    expect(restaurantRefs(first).map(r => r.name)).toEqual(["Café L’Orient", "A different place"]);
    expect(next.dinner.map(r => r.name)).toEqual(["New dinner"]);
  });

  it("does not treat several restaurants in the same guide or mall as one venue", () => {
    const used = new RestaurantRegistry();
    const result = uniqueMealOptions({ dinner: [option("Saffron"), option("Juniper")] }, used);
    expect(result.dinner).toHaveLength(2);
    expect(sourceSites(["https://www.guide.co.uk/a", "https://food.guide.co.uk/b", "https://local.example/a"]).size).toBe(2);
  });

  it("rejects unobserved sources and keeps searching past duplicates for a valid backup", () => {
    const used = new RestaurantRegistry([{ name: "Already reserved" }]);
    const result = uniqueMealOptions({ lunch: [option("Already reserved"), { ...option("Invented"), sourceUrls: ["https://invented.example/a"] }, option("Valid one"), option("Valid two")] }, used, ["https://guide.example/food"]);
    expect(result.lunch.map(r => r.name)).toEqual(["Valid one", "Valid two"]);
  });
});
