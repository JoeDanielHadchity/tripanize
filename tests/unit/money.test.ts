import { describe, expect, it } from "vitest";
import { allocate, convertMinor, formatMoney, parseMoney } from "@/lib/money";

describe("parseMoney", () => {
  it("parses decimals without float drift", () => {
    expect(parseMoney("19.99", "EUR")).toBe(1999);
    expect(parseMoney("0.1", "USD")).toBe(10);
    expect(parseMoney("1,234.56", "USD")).toBe(123456);
    expect(parseMoney("12,50", "EUR")).toBe(1250);
    expect(parseMoney("1500", "JPY")).toBe(1500);
  });
  it("rejects invalid or over-precise input", () => {
    expect(parseMoney("abc", "EUR")).toBeNull();
    expect(parseMoney("1.234", "EUR")).toBeNull();
    expect(parseMoney("1.5", "JPY")).toBeNull();
    expect(parseMoney("-5", "EUR")).toBeNull();
  });
});

describe("allocate", () => {
  it("never loses or creates money", () => {
    for (const total of [1, 2, 99, 100, 101, 1000, 9999, 12345]) {
      for (const n of [1, 2, 3, 4, 6, 7]) {
        const parts = allocate(total, Array(n).fill(1));
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });
  it("splits 100.00 three ways as 33.34/33.33/33.33 deterministically", () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
  });
  it("respects weights", () => {
    expect(allocate(1000, [5000, 3000, 2000])).toEqual([500, 300, 200]);
    const p = allocate(1001, [3333, 3333, 3334]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(1001);
  });
});

describe("convertMinor", () => {
  it("converts with explicit rate and half-up rounding", () => {
    expect(convertMinor(10000, "USD", "EUR", "0.92")).toBe(9200);
    expect(convertMinor(333, "USD", "EUR", "0.915")).toBe(305); // 304.695 → 305
    expect(convertMinor(1000, "JPY", "EUR", "0.0062")).toBe(620); // ¥1000 → €6.20
  });
});

describe("formatMoney", () => {
  it("formats minor units", () => {
    expect(formatMoney(123456, "EUR")).toContain("1,234.56");
    expect(formatMoney(1500, "JPY")).toContain("1,500");
  });
});

import { zonedToUtc } from "@/lib/dates";
describe("zonedToUtc", () => {
  it("interprets wall-clock times in the trip time zone, including DST", () => {
    expect(zonedToUtc("2027-07-01T12:00", "Europe/Lisbon").toISOString()).toBe("2027-07-01T11:00:00.000Z");
    expect(zonedToUtc("2027-01-15T12:00", "America/New_York").toISOString()).toBe("2027-01-15T17:00:00.000Z");
    expect(zonedToUtc("2027-01-15T12:00", "Asia/Tokyo").toISOString()).toBe("2027-01-15T03:00:00.000Z");
  });
});
