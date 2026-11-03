"use client";

import { usePathname } from "next/navigation";

const PHOTOS: Record<string, string> = {
  expenses: "/editorial/expenses.webp",
  chat: "/editorial/chat.webp",
  packing: "/editorial/packing.webp",
  settings: "/editorial/settings.webp",
};

export function JourneyCover({ name, dates, destinations, countdown }: { name: string; dates: string; destinations: string[]; countdown?: { value: string; label: string } | null }) {
  const path = usePathname();
  const section = path.split("/")[3] ?? "itinerary";
  const porto = destinations.some(place => /porto|oporto/i.test(place));
  const photo = PHOTOS[section] ?? (porto && section === "itinerary" ? "/editorial/itinerary.webp" : porto && ["events", "bookings"].includes(section) ? "/editorial/events.webp" : null);
  if (["premium", "onboarding", "plan"].includes(section)) return null;
  // The dark trip banner from Design 004: photo, route and dates, name, and the countdown.
  return <div className={`journey-cover${photo ? " has-photo" : ""}`}>
    {photo && <img decoding="async" src={photo} alt="" aria-hidden="true" loading="lazy" />}
    <div className="journey-cover-text"><p>{destinations.join(" → ")}{dates && <>{destinations.length > 0 ? " · " : ""}{dates}</>}</p><h2>{name}</h2></div>
    {countdown && <p className="journey-cover-count"><strong>{countdown.value}</strong> <span>{countdown.label}</span></p>}
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
