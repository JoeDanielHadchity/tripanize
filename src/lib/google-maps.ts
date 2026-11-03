/** Browser side of the Google Maps integration. The key comes from the server per request. */
export type GoogleMapsConfig = { key: string; mapId: string | null };

type MapsWindow = Window & { google?: { maps?: typeof google.maps }; gm_authFailure?: () => void; __tripanizeMapsReady?: () => void };

let loading: Promise<typeof google.maps> | null = null;
const authListeners = new Set<() => void>();

export function googleMapsScriptUrl(key: string) {
  return `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=marker&loading=async&callback=__tripanizeMapsReady`;
}

/** Loads the Maps JavaScript API once per page. Rejects if the script can't load. */
export function loadGoogleMaps(key: string): Promise<typeof google.maps> {
  const w = window as MapsWindow;
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  loading ??= new Promise<typeof google.maps>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => { loading = null; script.remove(); reject(new Error("Google Maps could not load.")); };
    const timer = window.setTimeout(fail, 15000);
    w.__tripanizeMapsReady = () => { window.clearTimeout(timer); if (w.google?.maps?.Map) resolve(w.google.maps); else fail(); };
    // Google calls this when the key is invalid or not allowed on this domain.
    w.gm_authFailure = () => { for (const l of authListeners) l(); };
    script.src = googleMapsScriptUrl(key);
    script.async = true;
    script.onerror = () => { window.clearTimeout(timer); fail(); };
    document.head.appendChild(script);
  });
  return loading;
}

/** Called if Google rejects the key after loading (wrong domain, API not enabled, billing off). */
export function onGoogleMapsAuthFailure(listener: () => void) {
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
}

export type PinOptions = { lat: number; lng: number; color: string; title: string; label?: string; mapId: string | null };

/** A round coloured pin; modern Advanced Markers when a map ID is set, classic markers otherwise. */
export function addPin(gm: typeof google.maps, map: google.maps.Map, o: PinOptions): { remove: () => void; onClick: (fn: () => void) => void; anchor: google.maps.marker.AdvancedMarkerElement | google.maps.Marker } {
  if (o.mapId && gm.marker?.AdvancedMarkerElement) {
    // The dot is the marker; it is shifted down by half so its centre sits on the point.
    const content = document.createElement("div");
    content.style.cssText = `position:relative;width:18px;height:18px;box-sizing:border-box;border-radius:50%;background:${o.color};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:translateY(50%)`;
    if (o.label) {
      const chip = document.createElement("div");
      chip.textContent = o.label;
      chip.style.cssText = "position:absolute;top:calc(100% + 3px);left:50%;transform:translateX(-50%);padding:1px 7px;border-radius:8px;background:rgba(255,255,255,.95);color:#172e33;font:700 12px/16px system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.2)";
      content.appendChild(chip);
    }
    const marker = new gm.marker.AdvancedMarkerElement({ map, position: { lat: o.lat, lng: o.lng }, title: o.title, content, gmpClickable: true });
    return { anchor: marker, remove: () => { marker.map = null; }, onClick: fn => { marker.addListener("click", fn); } };
  }
  const marker = new gm.Marker({
    map,
    position: { lat: o.lat, lng: o.lng },
    title: o.title,
    icon: { path: gm.SymbolPath.CIRCLE, scale: 9, fillColor: o.color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2, labelOrigin: new gm.Point(0, 2.6) },
    label: o.label ? { text: o.label, color: "#172e33", fontSize: "12px", fontWeight: "700" } : undefined,
  });
  return { anchor: marker, remove: () => marker.setMap(null), onClick: fn => { marker.addListener("click", fn); } };
}

/** Fit all points, never closer than maxZoom (one point would otherwise zoom to street level). */
export function fitPoints(gm: typeof google.maps, map: google.maps.Map, points: { lat: number; lng: number }[], padding: number, maxZoom: number) {
  if (!points.length) return;
  const bounds = new gm.LatLngBounds();
  for (const p of points) bounds.extend(p);
  map.fitBounds(bounds, padding);
  gm.event.addListenerOnce(map, "idle", () => { if ((map.getZoom() ?? 0) > maxZoom) map.setZoom(maxZoom); });
}
