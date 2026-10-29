"use client";

import { useEffect, useRef, useState } from "react";

import { HOME_SCENES as SCENES } from "@/lib/home-content";

export function FlightExplainer() {
  const [scene, setScene] = useState(0);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setInterval(() => {
      // Keep the steps still for reduced motion, background tabs, or someone using the step controls.
      if (reducedMotion.matches || document.hidden || section.current?.querySelector(".flight-stops")?.contains(document.activeElement)) return;
      setScene(current => (current + 1) % SCENES.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);
  const current = SCENES[scene];
  const t = scene / 3;
  const x = (1 - t) ** 3 * 25 + 3 * (1 - t) ** 2 * t * 100 + 3 * (1 - t) * t ** 2 * 300 + t ** 3 * 375;
  const y = (1 - t) ** 3 * 95 + 3 * (1 - t) ** 2 * t * 5 + 3 * (1 - t) * t ** 2 * 5 + t ** 3 * 95;
  return <section ref={section} id="how-it-works" className="flight-explainer scroll-mt-20" aria-labelledby="how-title">
    <h2 id="how-title" className="font-display text-3xl font-semibold">How it works</h2>
    <div className="flight-layout">
      <div>
        <div className="flight-route" aria-hidden="true">
          <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="flight-line"><path d="M25,95 C100,5 300,5 375,95" /></svg>
          {[{ x: 6.25, y: 79.17 }, { x: 33.1, y: 29.17 }, { x: 66.9, y: 29.17 }, { x: 93.75, y: 79.17 }].map((point, index) => <span key={index} className="flight-dot" style={{ left: `${point.x}%`, top: `${point.y}%` }} />)}
          <span className="flight-plane" style={{ left: `${x / 4}%`, top: `${y / 1.2}%` }}><svg viewBox="0 0 24 24" fill="currentColor"><path d="m21 3-6 18-4-8-8-4 18-6Zm-10 10L21 3" /></svg></span>
        </div>
        <div className="flight-stops" role="group" aria-label="Explainer steps">{SCENES.map((step, index) => <button key={step.label} type="button" aria-pressed={scene === index} onClick={() => setScene(index)}><b>{index + 1}</b>{step.label}</button>)}</div>
      </div>
      <div className="flight-note"><span className="ticket-tape" aria-hidden="true" /><h3 className="font-display text-2xl font-semibold">{current.title}</h3><p>{current.copy}</p><p className="flight-note-label">{current.note}</p><dl>{current.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
    </div>
    <p className="flight-plan-note">Free: 2 AI-planned days. Premium: $15 per trip, all travelers.</p>
  </section>;
}
