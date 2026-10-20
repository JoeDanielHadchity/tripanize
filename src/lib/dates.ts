// Calendar helpers working on "YYYY-MM-DD" strings so trip days never drift with server time zones.

export function isDateStr(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function isTimeStr(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function dateRange(start: string, end: string): string[] {
  const n = daysBetween(start, end);
  if (n < 0 || n > 366) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(start, i));
}

export function tripLength(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const n = daysBetween(start, end);
  return n >= 0 ? n + 1 : null;
}

/** Today's calendar date in an IANA time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Current wall-clock time "HH:MM" in a time zone. */
export function nowTimeIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type TripPhase = "upcoming" | "current" | "past" | "undated";

export function tripPhase(start: string | null | undefined, end: string | null | undefined, today: string): TripPhase {
  if (!start || !end) return "undated";
  if (today < start) return "upcoming";
  if (today > end) return "past";
  return "current";
}

export function formatDate(date: string | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  if (!date) return "Date not set";
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function formatDateRange(start?: string | null, end?: string | null) {
  if (!start || !end) return "Dates not set";
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const a = formatDate(start, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
  const b = formatDate(end, { day: "numeric", month: "short", year: "numeric" });
  return `${a} – ${b}`;
}

export function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatDuration(min?: number | null) {
  if (min === null || min === undefined) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatTimestamp(d: Date | string, timeZone: string) {
  const date = typeof d === "string" ? new Date(d) : d;
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** Converts a wall-clock "YYYY-MM-DDTHH:MM" in an IANA time zone to a UTC Date. */
export function zonedToUtc(local: string, timeZone: string): Date {
  const guess = Date.parse(`${local}:00Z`);
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms;
  };
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}
