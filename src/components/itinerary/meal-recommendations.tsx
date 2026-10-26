"use client";

import Link from "next/link";
import { useState } from "react";
import { MEALS, readMealOptions, type Meal } from "@/lib/meal-options";
import { directionsUrl, type MapsApp } from "@/lib/maps";
import { currencyDigits, formatMoney } from "@/lib/money";
import { ExternalLink, cx } from "@/components/ui";
import { PlanningText } from "@/components/planning-text";

export function MealRecommendations({ meals: raw, currency, mapsApp = "GOOGLE", preferencesHref }: { meals: unknown; currency: string; mapsApp?: MapsApp; preferencesHref?: string }) {
  const [meal, setMeal] = useState<Meal>("breakfast");
  const meals = readMealOptions(raw);
  if (!MEALS.some(key => meals[key].length)) {
    return preferencesHref ? <section className="mt-4 rounded-xl border border-line bg-surface p-4" aria-label="Restaurant options"><h4 className="font-semibold">Restaurant options</h4><p className="mt-1 text-sm text-muted">Add food preferences, then generate your itinerary for meal choices.</p><Link href={preferencesHref} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink underline">Food preferences</Link></section> : null;
  }
  return <section className="mt-4 rounded-xl border border-line bg-surface p-4" aria-label="Restaurant options">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-display text-lg font-semibold">Restaurant options</h4>{preferencesHref && <Link href={preferencesHref} className="text-xs text-accent-ink underline">Food preferences</Link>}</div>
    <div role="group" aria-label="Choose a meal" className="my-3 flex gap-1">{MEALS.map(key => <button key={key} type="button" aria-pressed={meal === key} onClick={() => setMeal(key)} className={cx("min-h-11 rounded-lg px-3 text-sm capitalize", meal === key ? "bg-accent text-on-accent" : "text-muted hover:bg-surface-2")}>{key}</button>)}</div>
    {meals[meal].length ? <div className="grid gap-3 sm:grid-cols-2">{meals[meal].map((restaurant, index) => {
      const directions = directionsUrl({ title: restaurant.name, address: restaurant.address ?? restaurant.area }, mapsApp);
      return <article key={restaurant.name} className="min-w-0 rounded-lg border border-line p-3">
        <p className="text-xs text-muted">Option {index + 1}</p><h5 className="mt-1 font-semibold">{restaurant.name}</h5>
        <p className="mt-1 text-xs text-muted">{[restaurant.cuisine, restaurant.area].filter(Boolean).join(" · ")}</p>
        {restaurant.pricePerPerson !== null && <p className="mt-1 text-xs">≈ {formatMoney(Math.round(restaurant.pricePerPerson * 10 ** currencyDigits(currency)), currency)} / person</p>}
        <p className="mt-2 text-sm"><PlanningText text={restaurant.whyFits} /></p>
        {restaurant.hoursNote && <p className="mt-2 text-xs text-muted"><PlanningText text={restaurant.hoursNote} /></p>}
        <div className="mt-2 flex flex-wrap gap-x-3 text-sm">{directions && <ExternalLink href={directions}>Directions</ExternalLink>}{restaurant.officialUrl && <ExternalLink href={restaurant.officialUrl}>Website</ExternalLink>}<ExternalLink href={restaurant.sourceUrls[0]}>Source</ExternalLink></div>
      </article>;
    })}</div> : <p className="text-sm text-muted">No sourced {meal} options were found for this day.</p>}
    <p className="mt-3 text-xs text-muted">Choose one option per meal. Check opening hours and dietary needs with the restaurant.</p>
  </section>;
}
