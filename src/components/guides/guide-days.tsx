"use client";

import { useState, type ReactNode } from "react";
import type { GuideDay } from "@/server/examples/city-guides";

export function GuideDays({ days, children }: { days: GuideDay[]; children: ReactNode }) {
  const [selected, setSelected] = useState(0);
  return <section className="guide-days" id="guide-days" aria-labelledby="guide-route-title">
    <div className="guide-section-heading"><h2 id="guide-route-title">Your four-day route.</h2><p>Choose a day · suggested times</p></div>
    <div className="guide-day-buttons" role="group" aria-label="Itinerary days">{days.map((day, index) => <button type="button" key={index} aria-pressed={selected === index} aria-controls={`guide-day-${index + 1}`} onClick={() => setSelected(index)}><span>Day {index + 1}</span><strong>{day.title}</strong></button>)}</div>
    <div className="guide-layout"><div>{days.map((day, index) => <section className="guide-day-panel" id={`guide-day-${index + 1}`} key={index} hidden={selected !== index} aria-labelledby={`guide-day-title-${index + 1}`}>
      <div className="guide-day-heading"><p className="guide-eyebrow">Day {index + 1} · {day.pace}</p><h3 id={`guide-day-title-${index + 1}`}>{day.title}</h3><p className="guide-route">{day.area}</p></div>
      <ol className="guide-stops">{day.stops.map((stop, stopIndex) => <li key={stopIndex}><time>{stop.time}</time><div><h4>{stop.title}</h4><p>{stop.detail}</p><div className="guide-stop-meta"><span>{stop.kind}</span><span>{stop.duration}</span>{stop.url && <a href={stop.url} target="_blank" rel="noopener noreferrer">Visit website <span aria-hidden="true">↗</span></a>}</div></div></li>)}</ol>
      <section className="guide-food"><h3>Eat nearby.</h3><p>{day.food}</p></section>
      <div className="guide-day-notes"><details open><summary>Good to know today</summary><p>{day.note}</p></details><details><summary>If plans change</summary><p>{day.planB}</p></details></div>
    </section>)}</div>{children}</div>
    <p className="sr-only" aria-live="polite">Showing day {selected + 1}: {days[selected].title}</p>
  </section>;
}
