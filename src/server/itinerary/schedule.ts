import { fromMinutes, toMinutes } from "@/lib/dates";

/**
 * Pure scheduling helpers. "Anchored" stops (fixed commitments and booking projections) never move:
 * when flexible stops would run into them we report a conflict instead of shifting the anchor.
 */
export type SchedStop = {
  id: string;
  title: string;
  startTime: string | null;
  durationMin: number | null;
  travelToNextMin: number | null;
  anchored: boolean;
  isMeal: boolean;
  skipped: boolean;
  estCostMinor: number | null;
  bookingStatus?: string | null;
};

export type Conflict = { stopId: string; message: string; severity: "warning" | "conflict" };

export const DEFAULT_DAY_START = "09:00";
const DEFAULT_DURATION = 60;

/**
 * mode "sequence": flexible stops are laid out back to back from the day start (used after reordering/moving).
 * mode "push":     flexible stops keep their planned time unless an earlier stop now overruns it (used after edits).
 */
export function recalcDay(stops: SchedStop[], mode: "sequence" | "push" = "push"): { stops: SchedStop[]; conflicts: Conflict[] } {
  const out = stops.map((s) => ({ ...s }));
  const conflicts: Conflict[] = [];
  const active = out.filter((s) => !s.skipped);
  if (!active.length) return { stops: out, conflicts };

  // In sequence mode the day keeps its original start time even if a different stop is now first.
  let cursor = toMinutes(mode === "sequence" ? earliest(active) : (active[0].startTime ?? DEFAULT_DAY_START));
  let prev: SchedStop | null = null;

  for (const s of active) {
    if (s.anchored && s.startTime) {
      const start = toMinutes(s.startTime);
      if (prev && cursor > start) {
        conflicts.push({
          stopId: prev.id,
          severity: "conflict",
          message: `“${prev.title}” (plus travel) runs ${cursor - start} min into fixed “${s.title}” at ${s.startTime}.`,
        });
      }
      cursor = Math.max(cursor, start) + (s.durationMin ?? DEFAULT_DURATION) + (s.travelToNextMin ?? 0);
    } else if (s.anchored) {
      cursor += (s.durationMin ?? DEFAULT_DURATION) + (s.travelToNextMin ?? 0);
    } else {
      const planned = s.startTime ? toMinutes(s.startTime) : cursor;
      const start = mode === "push" ? Math.max(cursor, planned) : cursor;
      s.startTime = fromMinutes(start);
      cursor = start + (s.durationMin ?? DEFAULT_DURATION) + (s.travelToNextMin ?? 0);
    }
    if (cursor >= 24 * 60) {
      conflicts.push({ stopId: s.id, severity: "warning", message: `The day now runs past midnight after “${s.title}”.` });
      break;
    }
    prev = s;
  }
  return { stops: out, conflicts };
}

function earliest(stops: SchedStop[]) {
  const times = stops.map((s) => s.startTime).filter((t): t is string => Boolean(t)).sort();
  return times[0] ?? DEFAULT_DAY_START;
}

export function dayBounds(stops: SchedStop[]) {
  const active = stops.filter((s) => !s.skipped && s.startTime);
  if (!active.length) return { start: null as string | null, finish: null as string | null };
  const start = Math.min(...active.map((s) => toMinutes(s.startTime!)));
  const finish = Math.max(...active.map((s) => toMinutes(s.startTime!) + (s.durationMin ?? DEFAULT_DURATION)));
  return { start: fromMinutes(start), finish: fromMinutes(Math.min(finish, 24 * 60 - 1)) };
}

export type Impact = {
  startBefore: string | null;
  startAfter: string | null;
  finishBefore: string | null;
  finishAfter: string | null;
  travelBefore: number;
  travelAfter: number;
  costBefore: number;
  costAfter: number;
  moved: { id: string; title: string; from: string | null; to: string | null }[];
  meals: { id: string; title: string; from: string | null; to: string | null }[];
  conflicts: Conflict[];
  bookingsAffected: { id: string; title: string; status: string }[];
  material: boolean;
};

const sumTravel = (s: SchedStop[]) => s.filter((x) => !x.skipped).reduce((a, x) => a + (x.travelToNextMin ?? 0), 0);
const sumCost = (s: SchedStop[]) => s.filter((x) => !x.skipped).reduce((a, x) => a + (x.estCostMinor ?? 0), 0);

export function computeImpact(before: SchedStop[], after: SchedStop[], conflicts: Conflict[]): Impact {
  const b = dayBounds(before);
  const a = dayBounds(after);
  const prevById = new Map(before.map((s) => [s.id, s]));
  const moved: Impact["moved"] = [];
  for (const s of after) {
    const p = prevById.get(s.id);
    if (p && p.startTime !== s.startTime) moved.push({ id: s.id, title: s.title, from: p.startTime, to: s.startTime });
  }
  const meals = moved.filter((m) => after.find((s) => s.id === m.id)?.isMeal);
  const bookingsAffected = after
    .filter((s) => s.anchored && s.bookingStatus && moved.some((m) => m.id === s.id))
    .map((s) => ({ id: s.id, title: s.title, status: s.bookingStatus! }));
  const shift = (x: string | null, y: string | null) => (x && y ? Math.abs(toMinutes(x) - toMinutes(y)) : 0);
  const material =
    conflicts.length > 0 ||
    meals.some((m) => shift(m.from, m.to) >= 30) ||
    shift(b.finish, a.finish) >= 30 ||
    moved.some((m) => shift(m.from, m.to) >= 45) ||
    bookingsAffected.length > 0;
  return {
    startBefore: b.start,
    startAfter: a.start,
    finishBefore: b.finish,
    finishAfter: a.finish,
    travelBefore: sumTravel(before),
    travelAfter: sumTravel(after),
    costBefore: sumCost(before),
    costAfter: sumCost(after),
    moved,
    meals,
    conflicts,
    bookingsAffected,
    material,
  };
}

/** Detects overlaps in an already-timed day (used to validate AI output and event scheduling). */
export function findOverlaps(stops: SchedStop[]): Conflict[] {
  const timed = stops.filter((s) => !s.skipped && s.startTime).sort((x, y) => x.startTime!.localeCompare(y.startTime!));
  const out: Conflict[] = [];
  for (let i = 0; i < timed.length - 1; i++) {
    const cur = timed[i];
    const next = timed[i + 1];
    const end = toMinutes(cur.startTime!) + (cur.durationMin ?? DEFAULT_DURATION);
    if (end > toMinutes(next.startTime!)) {
      out.push({ stopId: next.id, severity: cur.anchored || next.anchored ? "conflict" : "warning", message: `“${cur.title}” (until ${fromMinutes(end)}) overlaps “${next.title}” at ${next.startTime}.` });
    }
  }
  return out;
}
