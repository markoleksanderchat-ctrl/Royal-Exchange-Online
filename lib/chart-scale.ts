import type { MarketHistoryPoint } from "./market";

const EASTERN_TIME_ZONE = "America/New_York";

/** Rounded axis intervals with breathing room, including the session baseline. */
export function priceAxis(values: number[], reference?: number) {
  const finite = [...values, ...(reference === undefined ? [] : [reference])].filter(Number.isFinite);
  const low = finite.length ? Math.min(...finite) : 0;
  const high = finite.length ? Math.max(...finite) : 1;
  const span = Math.max(high - low, Math.abs((high + low) / 2) * 0.001, 0.04);
  const roughStep = span * 1.24 / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 2, 2.5, 5, 10].find(value => value >= roughStep / magnitude) ?? 10) * magnitude;
  const minimum = Math.floor((low - span * 0.12) / step) * step;
  const maximum = Math.ceil((high + span * 0.12) / step) * step;
  const ticks = Array.from({ length: Math.round((maximum - minimum) / step) + 1 },
    (_, index) => Number((minimum + index * step).toFixed(8)));
  return { minimum, maximum, ticks };
}

/** Labels use the exchange's continuous Eastern-time session, not US stock hours. */
export function timeAxis(points: MarketHistoryPoint[], width: number) {
  if (points.length < 2) return [];
  const start = Date.parse(points[0].time);
  const end = Date.parse(points.at(-1)!.time);
  const span = end - start;
  if (!Number.isFinite(span) || span <= 0) return [];
  const intraday = span <= 30 * 60 * 60_000;
  const roughMinutes = span / 60_000 / Math.max(2, Math.min(5, Math.floor(width / 90)));
  const intervals = intraday ? [5, 15, 30, 60, 120, 180, 240, 360, 480, 720, 1440]
    : [1440, 2880, 4320, 10080, 20160, 43200, 86400, 129600, 259200, 525600];
  const interval = (intervals.find(minutes => minutes >= roughMinutes) ?? Math.ceil(roughMinutes)) * 60_000;
  const formatter = new Intl.DateTimeFormat("en-US", intraday
    ? { hour: "numeric", minute: "2-digit", hour12: true, timeZone: EASTERN_TIME_ZONE }
    : { month: "short", ...(span > 180 * 24 * 60 * 60_000 ? { year: "2-digit" } : { day: "numeric" }), timeZone: EASTERN_TIME_ZONE });
  const ticks = [];
  for (let time = Math.ceil(start / interval) * interval; time <= end; time += interval) {
    ticks.push({ time, label: formatter.format(new Date(time)) });
  }
  return ticks;
}
