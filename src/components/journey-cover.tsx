"use client";

import { usePathname } from "next/navigation";
import type { DestinationImage } from "@/server/images";
import { TripCoverPhoto } from "./trip-cover-photo";

export function JourneyCover({ tripId, name, dates, destinations, countdown, image, action }: { tripId: string; name: string; dates: string; destinations: string[]; countdown?: { value: string; label: string } | null; image?: DestinationImage | null; action?: React.ReactNode }) {
  const path = usePathname();
  const section = path.split("/")[3] ?? "itinerary";
  if (["premium", "onboarding", "plan"].includes(section)) return null;
  // Design 004 trip banner: the trip's own cover photo under an ink shade (plain ink when there is none),
  // then route and dates, the name and the countdown. The same on every section of the trip.
  return <div className="journey-cover">
    {destinations[0] && <span className="journey-cover-photo" aria-hidden="true"><TripCoverPhoto tripId={tripId} destination={destinations[0]} initialImage={image ?? null} /></span>}
    <span className="journey-cover-shade" aria-hidden="true" />
    <div className="journey-cover-text"><p>{destinations.join(" → ")}{dates && <>{destinations.length > 0 ? " · " : ""}{dates}</>}</p><h2>{name}</h2></div>
    {countdown && <p className="journey-cover-count"><strong>{countdown.value}</strong> <span>{countdown.label}</span></p>}
    {action && <div className="journey-cover-action">{action}</div>}
  </div>;
}

export function AuthArtwork() {
  const path = usePathname();
  // Design 004: every sign-in style page gets the photo panel with an ink fade and a big headline.
  const copy = path === "/sign-in" ? ["Welcome back", <>Your next trip<br />is waiting.</>] : path === "/sign-up" ? ["Start free", <>Plan less.<br />Travel more.</>] : ["Tripanize", <>Plan less.<br />Travel more.</>];
  return <aside className="auth-artwork has-photo" aria-hidden="true">
    <img decoding="async" src="/editorial/auth.webp" alt="" />
    <div><p className="auth-eyebrow">{copy[0]}</p><p className="font-display text-5xl font-extrabold leading-[0.95]">{copy[1]}</p></div>
  </aside>;
}
