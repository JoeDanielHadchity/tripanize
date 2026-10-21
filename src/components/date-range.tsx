"use client";

import { useState } from "react";
import { cx } from "./ui";

// Month calendar for picking a trip's start and end dates: tap the first day, then the last day.
// Dates are plain "YYYY-MM-DD" strings and all math is done in UTC, so no time zone can shift a day.

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const todayIso = () => {
  const n = new Date();
  return iso(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
};
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);

function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return { date: iso(d), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month };
  });
}

export function DateRangeCalendar({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  const today = todayIso();
  const base = parse(start || today);
  const [view, setView] = useState({ y: base.getUTCFullYear(), m: base.getUTCMonth() });
  const [hover, setHover] = useState<string | null>(null);
  const choosingEnd = Boolean(start && !end);

  function pick(d: string) {
    if (!start || end) onChange(d, "");
    else if (d < start) onChange(d, "");
    else onChange(start, d);
  }
  const shift = (n: number) => setView(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const rangeEnd = end || (choosingEnd && hover && hover > start ? hover : "");
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(view.y, view.m, 1)));
  const label = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parse(d));
  const short = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(parse(d));

  return (
    <div className="rounded-2xl border border-line bg-surface p-3 sm:p-4" onMouseLeave={() => setHover(null)}>
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold" aria-live="polite">{title}</p>
        <div className="flex gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">‹</button>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">›</button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-xs font-medium text-muted" aria-hidden>
        {WEEKDAYS.map((w, i) => <span key={i} className="py-1">{w}</span>)}
      </div>
      <div className="grid grid-cols-7" role="group" aria-label={`${title}. ${choosingEnd ? "Choose the last day of the trip." : "Choose the first day of the trip."}`}>
        {monthGrid(view.y, view.m).map((c) => {
          const isStart = c.date === start;
          const isEnd = c.date === (end || "");
          const inRange = Boolean(start && rangeEnd && c.date > start && c.date < rangeEnd);
          const edgeOfRange = Boolean(start && rangeEnd && (isStart || c.date === rangeEnd));
          return (
            <div key={c.date} className={cx("relative flex h-11 items-center justify-center", inRange && "bg-accent-soft", edgeOfRange && isStart && "bg-gradient-to-r from-transparent from-50% to-accent-soft to-50%", edgeOfRange && !isStart && "bg-gradient-to-r from-accent-soft from-50% to-transparent to-50%")}>
              <button
                type="button"
                onClick={() => pick(c.date)}
                onMouseEnter={() => setHover(c.date)}
                onFocus={() => setHover(c.date)}
                aria-label={`${label(c.date)}${isStart ? ", trip start" : ""}${isEnd ? ", trip end" : ""}${c.date === today ? ", today" : ""}`}
                aria-pressed={isStart || isEnd}
                className={cx(
                  "relative z-10 h-10 w-10 rounded-full text-sm tabular-nums",
                  isStart || isEnd || (choosingEnd && c.date === rangeEnd) ? "bg-accent font-semibold text-on-accent" : "hover:bg-surface-2",
                  !isStart && !isEnd && !c.inMonth && "text-muted/60",
                  !isStart && !isEnd && c.date < today && c.inMonth && "text-muted",
                  c.date === today && !isStart && !isEnd && "ring-1 ring-accent",
                )}
              >
                {c.day}
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
        <p>
          {start && end ? (
            <><strong>{short(start)}</strong> → <strong>{short(end)}</strong> <span className="text-muted">· {daysBetween(start, end) + 1} day{daysBetween(start, end) === 0 ? "" : "s"}</span></>
          ) : start ? (
            <><strong>{short(start)}</strong> <span className="text-muted">→ now tap the last day</span></>
          ) : (
            <span className="text-muted">Tap the first day of your trip</span>
          )}
        </p>
        {(start || end) && <button type="button" onClick={() => onChange("", "")} className="min-h-11 px-2 text-accent-ink underline">Clear dates</button>}
      </div>
    </div>
  );
}
