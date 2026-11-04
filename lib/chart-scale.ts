import type { MarketHistoryPoint } from "./market";
import { easternDay } from "./market-calendar.ts";
import { tradingTimeScale } from "./trading-time.ts";

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

/** Labels use the recorded exchange session in Eastern Time. */
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

/** Same label styling, positioned in open-market time instead of closed hours. */
export function tradingTimeAxis(points: MarketHistoryPoint[], width: number, scale=tradingTimeScale(points)) {
  if (points.length<2) return [];
  const start=Date.parse(points[0].time),end=Date.parse(points.at(-1)!.time);
  if (easternDay(start)===easternDay(end)) return timeAxis(points,width).map(tick => ({...tick,position:scale.position(tick.time)}));
  const formatter=new Intl.DateTimeFormat("en-US",{ month:"short",...(end-start>180*86_400_000 ? {year:"2-digit"} : {day:"numeric"}),timeZone:EASTERN_TIME_ZONE });
  const candidates=scale.sessions.filter(session => session.opensAt>=start && session.opensAt<=end)
    .map(session => ({time:session.opensAt,label:formatter.format(session.opensAt),position:scale.position(session.opensAt)}));
  const count=Math.max(2,Math.min(5,Math.floor(width/90))),selected=new Set<number>();
  for (let index=0;index<count && candidates.length;index++) {
    const target=scale.span*index/(count-1);
    selected.add(candidates.reduce((best,tick,i) => Math.abs(tick.position-target)<Math.abs(candidates[best].position-target) ? i : best,0));
  }
  let lastPosition=-Infinity,lastLabel="";
  return candidates.filter((tick,index) => {
    if (!selected.has(index) || tick.position-lastPosition<scale.span*75/Math.max(1,width) || tick.label===lastLabel) return false;
    lastPosition=tick.position;lastLabel=tick.label;return true;
  });
}
