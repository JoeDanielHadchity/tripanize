"use client";

import { usePathname } from "next/navigation";

const PHOTOS: Record<string, string> = {
  expenses: "/editorial/expenses.jpg",
  chat: "/editorial/chat.jpg",
  packing: "/editorial/packing.jpg",
  settings: "/editorial/settings.jpg",
};

export function JourneyCover({ name, dates, destinations }: { name: string; dates: string; destinations: string[] }) {
  const path = usePathname();
  const section = path.split("/")[3] ?? "itinerary";
  const porto = destinations.some(place => /porto|oporto/i.test(place));
  const photo = PHOTOS[section] ?? (porto && section === "itinerary" ? "/editorial/itinerary.jpg" : porto && ["events", "bookings"].includes(section) ? "/editorial/events.jpg" : null);
  if (["premium", "onboarding", "plan"].includes(section)) return null;
  return <div className={`journey-cover${photo ? " has-photo" : ""}`}>
    {photo && <img src={photo} alt="" aria-hidden="true" loading="lazy" />}
    <div><p>{destinations.join(" → ")}{dates && <>{destinations.length > 0 ? " · " : ""}{dates}</>}</p><h2>{name}</h2></div>
  </div>;
}

export function AuthArtwork() {
  const path = usePathname();
  return <aside className={`auth-artwork${path === "/sign-in" ? " has-photo" : ""}`} aria-hidden="true">
    {path === "/sign-in" && <img src="/editorial/auth.jpg" alt="" />}
    <div><p className="font-display text-4xl font-semibold">Plan less.<br />Travel more.</p></div>
  </aside>;
}
