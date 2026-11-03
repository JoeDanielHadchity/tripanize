"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { DEFAULT_THEME, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Match this device" },
  { value: "light", label: "Light", hint: "Light appearance" },
  { value: "dark", label: "Dark", hint: "Dark appearance" },
];

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

export function AppearanceSetting() {
  const [choice, setChoice] = useState<ThemeChoice>(DEFAULT_THEME);
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    setChoice(t === "light" || t === "dark" ? t : "system");
  }, []);
  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-3 gap-3">
        {OPTIONS.map((o) => {
          const on = choice === o.value;
          return (
            <label key={o.value} className={cx("cursor-pointer rounded-2xl border p-3 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus)]", on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2")}>
              <input type="radio" name="theme" value={o.value} checked={on} onChange={() => { setChoice(o.value); apply(o.value); }} className="sr-only" />
              <ThemePreview kind={o.value} />
              <span className="mt-2 block font-semibold">{o.label}</span>
              <span className="block text-xs text-muted">{o.hint}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">Changes apply right away. Each fresh visit or reload starts in light mode.</p>
    </fieldset>
  );
}

function ThemePreview({ kind }: { kind: ThemeChoice }) {
  const light = { bg: "#f6f2e9", card: "#fffdf8", line: "#e6dfd0", accent: "#0b6e74", text: "#172e33" };
  const dark = { bg: "#0f1e21", card: "#172e33", line: "#2f4a50", accent: "#5fc4bb", text: "#f3efe6" };
  const pane = (c: typeof light, clip?: string) => (
    <g clipPath={clip}>
      <rect width="96" height="60" fill={c.bg} />
      <rect x="8" y="8" width="44" height="6" rx="3" fill={c.text} opacity=".8" />
      <rect x="8" y="20" width="80" height="16" rx="4" fill={c.card} stroke={c.line} />
      <rect x="8" y="42" width="30" height="10" rx="5" fill={c.accent} />
    </g>
  );
  return (
    <svg viewBox="0 0 96 60" aria-hidden className="mx-auto h-auto w-full max-w-24 overflow-hidden rounded-lg border border-line">
      <defs><clipPath id="half"><rect x="48" width="48" height="60" /></clipPath></defs>
      {kind === "dark" ? pane(dark) : pane(light)}
      {kind === "system" && pane(dark, "url(#half)")}
    </svg>
  );
}
