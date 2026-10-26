import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { readMealOptions, type RestaurantOption } from "@/lib/meal-options";
import { ProposalSchema } from "@/server/planner/schema";

const option = (name: string): RestaurantOption => ({ name, cuisine: "Local", area: "Old town", address: null, whyFits: "Casual and close to the day's sights", pricePerPerson: 18, officialUrl: "https://restaurant.example/menu", sourceUrls: ["https://restaurant.example/menu"], hoursNote: "Confirm opening hours before visiting" });

describe("meal choices", () => {
  it("keeps two distinct sourced options per meal and sanitizes links and prices", () => {
    const meals = readMealOptions({ breakfast: [option("Cafe A"), option("cafe-a"), { ...option("Cafe B"), officialUrl: "javascript:alert(1)", pricePerPerson: -10 }, option("Cafe C")], lunch: [{ ...option("Unsourced"), sourceUrls: ["file:///etc/passwd"] }] });
    expect(meals.breakfast.map(r => r.name)).toEqual(["Cafe A", "Cafe B"]);
    expect(meals.breakfast[1]).toMatchObject({ officialUrl: null, pricePerPerson: null });
    expect(meals.lunch).toEqual([]);
    expect(readMealOptions(null)).toEqual({ breakfast: [], lunch: [], dinner: [] });
  });

  it("only keeps restaurant sources actually observed during the web search", () => {
    const meals = readMealOptions({ dinner: [option("Verified"), { ...option("Invented link"), sourceUrls: ["https://invented.example/"] }] }, ["https://restaurant.example/menu#details"]);
    expect(meals.dinner.map(r => r.name)).toEqual(["Verified"]);
  });

  it("requires all three meals in the strict AI output contract", () => {
    const schema = zodTextFormat(ProposalSchema, "trip_plan").schema as Record<string, any>;
    const day = schema.properties.days.items;
    expect(day.required).toContain("meals");
    expect(day.properties.meals.required).toEqual(expect.arrayContaining(["breakfast", "lunch", "dinner"]));
  });
});
