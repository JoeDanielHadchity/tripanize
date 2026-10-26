"use client";

import { useEffect, useState } from "react";
import type { DestinationImage } from "@/server/images";

/** Fetch separately so an unavailable image service never delays the trips page. */
export function TripCoverPhoto({ tripId, destination, initialImage = null }: { tripId: string; destination: string; initialImage?: DestinationImage | null }) {
  const [image, setImage] = useState<DestinationImage | null>(initialImage);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    setImage(initialImage);
    if (!initialImage) {
      const load = async (attempt = 0) => {
        try {
          const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/cover`, { signal: controller.signal, cache: "no-store" });
          const data = response.ok ? await response.json() as { image: DestinationImage | null } : null;
          if (controller.signal.aborted) return;
          if (data?.image) { setImage(data.image); return; }
          if (response.status === 401 || response.status === 403 || response.status === 404) return;
        } catch { if (controller.signal.aborted) return; }
        if (attempt < 2) retry = setTimeout(() => void load(attempt + 1), 3000 * (attempt + 1));
      };
      void load();
    }
    return () => { controller.abort(); clearTimeout(retry); };
  }, [tripId, destination, initialImage]);
  if (!image || failedUrl === image.url) return null;
  return <>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={image.url} alt={destination} width={1920} height={1080} decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" loading="lazy" onError={() => setFailedUrl(image.url)} />
    {image.pageUrl && <a href={image.pageUrl} target="_blank" rel="noreferrer" aria-label={`Photo credits for ${destination}: ${image.credit}`} className="absolute bottom-1 right-1 max-w-[90%] truncate rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white hover:underline">{image.credit}</a>}
  </>;
}
