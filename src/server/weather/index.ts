import { addDays, daysBetween } from "@/lib/dates";
import { cached, fetchJson } from "@/server/http";

/**
 * Weather service.
 *  - "forecast": live Open-Meteo forecast, only for dates within FORECAST_DAYS of today.
 *  - "typical":  averages of the same calendar dates over the previous five years (Open-Meteo historical archive),
 *                explicitly labeled as typical conditions — never as a forecast.
 *  - "unavailable": no data could be fetched; callers show an honest indicator.
 */
export const FORECAST_DAYS = 14;

export type DayWeather = {
  date: string;
  kind: "forecast" | "typical";
  tMax: number | null;
  tMin: number | null;
  precipMm: number | null;
  precipProb: number | null;
  windMax: number | null;
  code: number | null;
  summary: string;
};

export type WeatherReport = {
  status: "ok" | "partial" | "unavailable";
  days: DayWeather[];
  source: string;
  fetchedAt: string | null;
  stale: boolean;
  note?: string;
};

const WMO: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Rain showers", 82: "Violent showers", 85: "Snow showers", 86: "Snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
};

type OMDaily = { daily?: { time: string[]; temperature_2m_max?: (number | null)[]; temperature_2m_min?: (number | null)[]; precipitation_sum?: (number | null)[]; precipitation_probability_max?: (number | null)[]; wind_speed_10m_max?: (number | null)[]; weather_code?: (number | null)[] } };

const r1 = (n: number | null | undefined) => (typeof n === "number" ? Math.round(n * 10) / 10 : null);

function typicalSummary(tMax: number | null, precip: number | null) {
  const parts: string[] = [];
  if (tMax !== null) parts.push(tMax >= 28 ? "Usually hot" : tMax >= 20 ? "Usually warm" : tMax >= 12 ? "Usually mild" : tMax >= 4 ? "Usually cool" : "Usually cold");
  if (precip !== null) parts.push(precip >= 4 ? "often wet" : precip >= 1 ? "some rain likely" : "mostly dry");
  return parts.join(", ") || "Typical conditions";
}

export async function getWeather(lat: number, lng: number, start: string, end: string, today: string): Promise<WeatherReport> {
  const days: DayWeather[] = [];
  const errors: string[] = [];
  let fetchedAt: Date | null = null;
  let stale = false;
  const lastForecastDay = addDays(today, FORECAST_DAYS - 1);
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;

  const fStart = start > today ? start : today;
  const fEnd = end < lastForecastDay ? end : lastForecastDay;
  if (fStart <= fEnd) {
    try {
      const res = await cached(`wx:f:${key}:${fStart}:${fEnd}`, 60 * 60 * 3, () =>
        fetchJson<OMDaily>("Open-Meteo forecast", `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&start_date=${fStart}&end_date=${fEnd}`),
      );
      fetchedAt = res.fetchedAt;
      stale ||= res.stale;
      const d = res.value.daily;
      d?.time.forEach((date, i) => {
        const code = d.weather_code?.[i] ?? null;
        days.push({ date, kind: "forecast", tMax: r1(d.temperature_2m_max?.[i]), tMin: r1(d.temperature_2m_min?.[i]), precipMm: r1(d.precipitation_sum?.[i]), precipProb: d.precipitation_probability_max?.[i] ?? null, windMax: r1(d.wind_speed_10m_max?.[i]), code, summary: code !== null ? WMO[code] ?? "Mixed" : "—" });
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "forecast failed");
    }
  }

  const tStart = start > lastForecastDay ? start : addDays(lastForecastDay, 1);
  if (tStart <= end && daysBetween(tStart, end) <= 60) {
    try {
      const thisYear = Number(today.slice(0, 4));
      const years = [1, 2, 3, 4, 5].map((k) => thisYear - k);
      const res = await cached(`wx:t:${key}:${tStart.slice(5)}:${end.slice(5)}:${years[0]}`, 60 * 60 * 24 * 30, async () => {
        const perYear = await Promise.all(
          years.map((y) => {
            const s = `${y}${tStart.slice(4)}`;
            const e = addDays(s, daysBetween(tStart, end));
            return fetchJson<OMDaily>("Open-Meteo archive", `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&start_date=${s}&end_date=${e}`, { timeoutMs: 15000 });
          }),
        );
        return { years, perYear };
      });
      fetchedAt ??= res.fetchedAt;
      stale ||= res.stale;
      const n = daysBetween(tStart, end) + 1;
      for (let i = 0; i < n; i++) {
        const avg = (field: "temperature_2m_max" | "temperature_2m_min" | "precipitation_sum") => {
          const vals = res.value.perYear.map((p) => p.daily?.[field]?.[i]).filter((v): v is number => typeof v === "number");
          return vals.length ? r1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        };
        const tMax = avg("temperature_2m_max");
        const precip = avg("precipitation_sum");
        days.push({ date: addDays(tStart, i), kind: "typical", tMax, tMin: avg("temperature_2m_min"), precipMm: precip, precipProb: null, windMax: null, code: null, summary: typicalSummary(tMax, precip) });
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "historical data failed");
    }
  }

  const status = errors.length === 0 ? "ok" : days.length ? "partial" : "unavailable";
  return {
    status,
    days,
    source: "Open-Meteo (forecast within 14 days; typical = average of the previous five years for the same dates)",
    fetchedAt: fetchedAt?.toISOString() ?? null,
    stale,
    note: errors.length ? `Some weather data is unavailable right now (${errors.join("; ")}).` : undefined,
  };
}

/** Practical alerts derived from a day's weather. Returned text explains *why*. */
export function weatherAlerts(w: DayWeather | undefined): string[] {
  if (!w) return [];
  const out: string[] = [];
  const label = w.kind === "forecast" ? "Forecast" : "Typical for this date";
  if ((w.precipProb ?? 0) >= 60 || (w.precipMm ?? 0) >= 5) out.push(`${label}: rain likely — consider your Plan B or indoor options.`);
  if ((w.tMax ?? 0) >= 32) out.push(`${label}: very hot (${w.tMax}°C) — plan shade and water breaks around midday.`);
  if ((w.tMin ?? 99) <= 0) out.push(`${label}: near or below freezing (${w.tMin}°C) — ice possible on roads and paths.`);
  if ((w.windMax ?? 0) >= 50) out.push(`${label}: strong wind (${w.windMax} km/h) — boat trips and viewpoints may be affected.`);
  if (w.code !== null && w.code >= 95) out.push("Forecast: thunderstorms — avoid exposed hikes.");
  return out;
}
