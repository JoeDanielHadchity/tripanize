"use client";

import { useEffect, useState } from "react";
import type { DestinationImage } from "@/server/images";

/** Fetch separately so an unavailable image service never delays the trips page. */
export function TripCoverPhoto({ tripId, destination }: { tripId: string; destination: string }) {
  const [image, setImage] = useState<DestinationImage | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/trips/${encodeURIComponent(tripId)}/cover`, { signal: controller.signal, cache: "no-store" })
      .then(async response => response.ok ? await response.json() as { image: DestinationImage | null } : null)
      .then(data => { if (!controller.signal.aborted) setImage(data?.image ?? null); })
      .catch(() => {});
    return () => controller.abort();
  }, [tripId, destination]);
  if (!image) return null;
  return <>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={image.url} alt={destination} width={960} height={540} referrerPolicy="no-referrer" className={`absolute inset-0 h-full w-full object-cover ${loaded ? "" : "invisible"}`} loading="lazy" onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />
    {loaded && image.pageUrl && <a href={image.pageUrl} target="_blank" rel="noreferrer" aria-label={`Photo credits for ${destination}: ${image.credit}`} className="absolute bottom-1 right-1 max-w-[90%] truncate rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white hover:underline">{image.credit}</a>}
  </>;
}
