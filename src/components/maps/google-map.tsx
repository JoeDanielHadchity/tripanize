"use client";

import { useEffect, useRef, useState } from "react";
import { addPin, fitPoints, loadGoogleMaps, onGoogleMapsAuthFailure, type GoogleMapsConfig } from "@/lib/google-maps";

export type GooglePoint = { id: string; lat: number; lng: number; color: string; title: string; label?: string; popup?: string; accuracy?: number };

/**
 * A Google map with round pins (and optional accuracy circles). Calls onFail if
 * Google can't load or rejects the key, so the caller can fall back to OpenStreetMap.
 */
export function GoogleMap({ config, points, className, ariaLabel, padding = 30, maxZoom = 14, fitSignal = 0, refitOnChange = true, onFail }: {
  config: GoogleMapsConfig; points: GooglePoint[]; className: string; ariaLabel: string; padding?: number; maxZoom?: number;
  /** Increase to fit all points again (for a "Show everyone" button). */
  fitSignal?: number;
  /** false keeps the user's pan and zoom when points move (live locations). */
  refitOnChange?: boolean;
  onFail: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<{ gm: typeof google.maps; map: google.maps.Map; info: google.maps.InfoWindow } | null>(null);
  const shapes = useRef<{ remove: () => void }[]>([]);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const key = JSON.stringify(points);

  useEffect(() => {
    let cancelled = false;
    const stopAuth = onGoogleMapsAuthFailure(() => failRef.current());
    loadGoogleMaps(config.key).then(gm => {
      if (cancelled || !container.current) return;
      const map = new gm.Map(container.current, {
        mapId: config.mapId ?? undefined,
        gestureHandling: "cooperative",
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
        clickableIcons: false,
        center: points[0] ? { lat: points[0].lat, lng: points[0].lng } : { lat: 20, lng: 0 },
        zoom: 12,
      });
      state.current = { gm, map, info: new gm.InfoWindow() };
      setReady(true);
    }).catch(() => { if (!cancelled) failRef.current(); });
    return () => { cancelled = true; stopAuth(); for (const s of shapes.current) s.remove(); shapes.current = []; state.current = null; };
  }, [config.key, config.mapId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = state.current;
    if (!ready || !s) return;
    for (const shape of shapes.current) shape.remove();
    shapes.current = [];
    for (const p of points) {
      if (p.accuracy && p.accuracy > 0) {
        const circle = new s.gm.Circle({ map: s.map, center: { lat: p.lat, lng: p.lng }, radius: p.accuracy, strokeColor: p.color, strokeWeight: 1, fillColor: p.color, fillOpacity: 0.08, clickable: false });
        shapes.current.push({ remove: () => circle.setMap(null) });
      }
      const pin = addPin(s.gm, s.map, { lat: p.lat, lng: p.lng, color: p.color, title: p.title, label: p.label, mapId: config.mapId });
      if (p.popup) {
        const text = p.popup;
        pin.onClick(() => { const div = document.createElement("div"); div.textContent = text; div.style.cssText = "font:500 14px/1.4 system-ui,sans-serif;color:#172e33;max-width:240px"; s.info.setContent(div); s.info.open({ map: s.map, anchor: pin.anchor }); });
      }
      shapes.current.push(pin);
    }
    if (refitOnChange || !fitted.current) { fitPoints(s.gm, s.map, points, padding, maxZoom); fitted.current = true; }
  }, [key, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = state.current;
    if (ready && s && fitSignal) fitPoints(s.gm, s.map, points, padding, maxZoom);
  }, [fitSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={container} className={className} role="region" aria-label={ariaLabel} />;
}
