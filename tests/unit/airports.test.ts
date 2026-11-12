import { expect, it } from "vitest";
import { airportLabel, searchAirports } from "@/server/airports/search";

const codes = (q: string, n = 3) => searchAirports(q, n).map(a => a.code);

it("finds airports by code, city, name and country, main hubs first", () => {
  expect(codes("LIS", 1)).toEqual(["LIS"]);
  expect(codes("lisbon", 1)).toEqual(["LIS"]);
  expect(codes("beirut", 1)).toEqual(["BEY"]);
  expect(codes("london", 2)).toEqual(["LHR", "LGW"]);
  expect(codes("par", 2)).toEqual(["CDG", "ORY"]);
  expect(codes("dubai", 2)).toEqual(["DXB", "DWC"]);
  expect(codes("heathrow", 1)).toEqual(["LHR"]);
  expect(codes("sao paulo", 2).sort()).toEqual(["CGH", "GRU"]);
  expect(codes("zurich", 1)).toEqual(["ZRH"]);
  expect(codes("saudi", 2)).toEqual(["RUH", "JED"]);
});

it("needs two characters and caps the list", () => {
  expect(searchAirports("l")).toEqual([]);
  expect(searchAirports("air").length).toBe(8);
});

it("labels airports with name, code and city", () => {
  expect(airportLabel({ code: "OPO", name: "Francisco de Sá Carneiro Airport", city: "Porto" })).toBe("Francisco de Sá Carneiro Airport (OPO), Porto");
  expect(airportLabel({ code: "LIS", name: "Lisbon Humberto Delgado Airport", city: "Lisbon" })).toBe("Lisbon Humberto Delgado Airport (LIS)");
});
