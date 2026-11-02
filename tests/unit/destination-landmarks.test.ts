import { describe, expect, it } from "vitest";
import { countryFor, destinationLandmarks } from "@/server/images/landmarks";

describe("geographic cover identities", () => {
  it("recognizes country names, common aliases and localized names", () => {
    for (const name of ["Lebanon", "LB", "Liban", "لبنان"]) expect(countryFor(name)?.code).toBe("LB");
    for (const name of ["UK", "United Kingdom", "Royaume-Uni"]) expect(countryFor(name)?.code).toBe("GB");
    expect(countryFor("UAE")?.code).toBe("AE");
    expect(countryFor("Bahrain")?.code).toBe("BH");
    expect(countryFor("Tokyo")).toBeNull();
  });

  it("uses recognizable national landmarks, not arbitrary country search hits", () => {
    expect(destinationLandmarks("Lebanon").landmarks[0]).toMatchObject({ title: "Raouché" });
    expect(destinationLandmarks("Bahrain", "BH").landmarks[0]).toMatchObject({ title: "Bahrain World Trade Center" });
    expect(destinationLandmarks("France").landmarks[0].title).toBe("Eiffel Tower");
  });

  it("keeps similarly named towns in the requested country", () => {
    expect(destinationLandmarks("Lebanon", "United States")).toMatchObject({ country: null, landmarks: [] });
    expect(destinationLandmarks("Paris", "United States")).toMatchObject({ country: null, landmarks: [] });
    expect(destinationLandmarks("Paris", "France").landmarks[0].title).toBe("Eiffel Tower");
    expect(destinationLandmarks("Hong Kong", "China").landmarks[0].title).toBe("Victoria Harbour");
  });
});
