import { expect, it } from "vitest";
import { WIZARD_STEPS, dateRangeLabel, dayTime, shortDay, emptyWizardDest, firstWizardProblem, splitStays, suggestTripName, tripDays, wizardStepError } from "@/lib/trip-wizard";

const dest = (name: string, arriveDate = "", departDate = "") => ({ ...emptyWizardDest(), name, arriveDate, departDate });
const base = { dests: [dest("Lisbon")], startDate: "2027-12-12", endDate: "2027-12-18", adults: 2, name: "Lisbon in December" };

it("has nine steps in the agreed order", () => {
  expect(WIZARD_STEPS.map(s => s.id)).toEqual(["where", "when", "who", "style", "budget", "getting", "places", "food", "ready"]);
  expect(WIZARD_STEPS.filter(s => s.optional).map(s => s.id)).toEqual(["style", "budget", "getting", "places", "food"]);
});

it("names the trip from the cities and month", () => {
  expect(suggestTripName([dest("Lisbon")], "2027-12-12")).toBe("Lisbon in December");
  expect(suggestTripName([dest("Lisbon"), dest("Porto")], "2027-12-12")).toBe("Lisbon & Porto in December");
  expect(suggestTripName([dest("Lisbon"), dest("Porto"), dest("Faro")], "")).toBe("Lisbon & more trip");
  expect(suggestTripName([dest(" ")], "2027-12-12")).toBe("");
});

it("labels date ranges with the number of days", () => {
  expect(tripDays("2027-12-12", "2027-12-18")).toBe(7);
  expect(dateRangeLabel("2027-12-12", "2027-12-18")).toBe("12 – 18 Dec · 7 days");
  expect(dateRangeLabel("2027-12-28", "2028-01-03")).toBe("28 Dec – 3 Jan · 7 days");
  expect(dateRangeLabel("2027-12-12", "2027-12-12")).toBe("12 Dec · 1 day");
});

it("stops Next only on the required steps", () => {
  expect(wizardStepError("where", { ...base, dests: [dest("")] })).toMatch(/where/);
  expect(wizardStepError("when", { ...base, endDate: "" })).toMatch(/first and last day/);
  expect(wizardStepError("when", { ...base, endDate: "2027-12-01" })).toMatch(/before/);
  expect(wizardStepError("when", { ...base, endDate: "2028-06-01" })).toMatch(/120 days/);
  expect(wizardStepError("who", { ...base, adults: 0 })).toMatch(/adult/);
  expect(wizardStepError("ready", { ...base, name: " " })).toMatch(/name/);
  for (const id of ["style", "budget", "getting", "places", "food"] as const) expect(wizardStepError(id, { ...base, dests: [], startDate: "", endDate: "", adults: 0, name: "" })).toBeNull();
  expect(firstWizardProblem(base)).toBeNull();
  expect(firstWizardProblem({ ...base, startDate: "" })?.index).toBe(1);
});

it("splits a multi-city trip evenly, sharing moving days, and checks each city's days", () => {
  const split = splitStays([dest("Lisbon"), dest("Porto")], "2027-12-12", "2027-12-18");
  expect(split.map(d => [d.arriveDate, d.departDate])).toEqual([["2027-12-12", "2027-12-15"], ["2027-12-15", "2027-12-18"]]);
  expect(wizardStepError("when", { ...base, dests: split })).toBeNull();
  expect(wizardStepError("when", { ...base, dests: [dest("Lisbon"), dest("Porto")] })).toMatch(/Lisbon/);
  expect(wizardStepError("when", { ...base, dests: [dest("Lisbon", "2027-12-10", "2027-12-14"), dest("Porto", "2027-12-14", "2027-12-18")] })).toMatch(/within the trip/);
  // Days already set are kept.
  const kept = splitStays([dest("Lisbon", "2027-12-12", "2027-12-13"), dest("Porto")], "2027-12-12", "2027-12-18");
  expect(kept[0].departDate).toBe("2027-12-13");
});

it("takes arrival and departure days from the trip dates unless changed", () => {
  expect(dayTime("", "14:30", "2027-04-10")).toBe("2027-04-10T14:30");
  expect(dayTime("2027-04-09", "23:15", "2027-04-10")).toBe("2027-04-09T23:15");
  expect(dayTime("", "", "2027-04-10")).toBe("");
  expect(dayTime("", "14:30", "")).toBe("");
  expect(shortDay("2027-04-10")).toBe("10 Apr");
});
