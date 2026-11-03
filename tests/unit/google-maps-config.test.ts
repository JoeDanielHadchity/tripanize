import { afterEach, describe, expect, it } from "vitest";
import { googleMapsConfig } from "@/server/maps";
import { googleMapsScriptUrl } from "@/lib/google-maps";

const KEY = "AIzaSyTestKey_1234567890abcdefghijk";

describe("Google Maps configuration", () => {
  afterEach(() => { delete process.env.GOOGLE_MAPS_BROWSER_KEY; delete process.env.GOOGLE_MAPS_MAP_ID; });

  it("keeps OpenStreetMap when no key is set", () => {
    expect(googleMapsConfig()).toBeNull();
    process.env.GOOGLE_MAPS_BROWSER_KEY = "   ";
    expect(googleMapsConfig()).toBeNull();
  });

  it("ignores a malformed key instead of sending it to the browser", () => {
    process.env.GOOGLE_MAPS_BROWSER_KEY = "not a key\"><script>";
    expect(googleMapsConfig()).toBeNull();
  });

  it("returns the key and the optional map ID", () => {
    process.env.GOOGLE_MAPS_BROWSER_KEY = ` ${KEY} `;
    expect(googleMapsConfig()).toEqual({ key: KEY, mapId: null });
    process.env.GOOGLE_MAPS_MAP_ID = "8e0a97af9386fef";
    expect(googleMapsConfig()).toEqual({ key: KEY, mapId: "8e0a97af9386fef" });
  });

  it("loads the Maps JavaScript API with the marker library", () => {
    const url = new URL(googleMapsScriptUrl(KEY));
    expect(url.origin).toBe("https://maps.googleapis.com");
    expect(url.searchParams.get("key")).toBe(KEY);
    expect(url.searchParams.get("libraries")).toBe("marker");
    expect(url.searchParams.get("loading")).toBe("async");
  });
});

describe("Google Maps pins", () => {
  it("draws classic round pins without a map ID and clamps the zoom after fitting", async () => {
    const { addPin, fitPoints } = await import("@/lib/google-maps");
    const made: Record<string, unknown>[] = [];
    let idle: (() => void) | undefined;
    let zoom = 18;
    class Marker { constructor(o: Record<string, unknown>) { made.push(o); } setMap() {} addListener() {} }
    class Point { constructor(public x: number, public y: number) {} }
    class LatLngBounds { pts: unknown[] = []; extend(p: unknown) { this.pts.push(p); } }
    const gm = { Marker, Point, LatLngBounds, SymbolPath: { CIRCLE: 0 }, event: { addListenerOnce: (_m: unknown, _e: string, fn: () => void) => { idle = fn; } } } as unknown as typeof google.maps;
    const map = { fitBounds: () => {}, getZoom: () => zoom, setZoom: (z: number) => { zoom = z; } } as unknown as google.maps.Map;
    const pin = addPin(gm, map, { lat: 38.69, lng: -9.2, color: "#0e8388", title: "Pastéis de Belém", label: "Maya", mapId: null });
    expect(made[0]).toMatchObject({ position: { lat: 38.69, lng: -9.2 }, title: "Pastéis de Belém", label: { text: "Maya" } });
    expect(typeof pin.remove).toBe("function");
    fitPoints(gm, map, [{ lat: 38.69, lng: -9.2 }], 30, 14);
    idle?.();
    expect(zoom).toBe(14);
  });
});
