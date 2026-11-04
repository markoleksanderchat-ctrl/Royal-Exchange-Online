import type { MarketHistoryPoint } from "./market.ts";
import { easternDay, sessionFor, type ExchangeSession } from "./market-calendar.ts";

export const CLEARING_MILLISECONDS = 300_000;

/** Coordinate transform only: scheduled closed time has no horizontal duration. */
export function tradingTimeScale(points: MarketHistoryPoint[]) {
  const times = points.map(point => Date.parse(point.time));
  const sessions: Array<ExchangeSession & { offset: number }> = [];
  let total = 0;
  if (times.length) {
    const lastDay = easternDay(times.at(-1)!);
    for (let day = easternDay(times[0]); day <= lastDay;) {
      const session = sessionFor(day);
      if (session) { sessions.push({ ...session, offset: total }); total += session.closesAt-session.opensAt; }
      day = new Date(Date.parse(day+"T12:00:00Z")+86_400_000).toISOString().slice(0,10);
    }
  }
  const preceding = (values: number[], time: number) => {
    let low=0, high=values.length;
    while (low<high) { const middle=(low+high)>>>1; if (values[middle]<=time) low=middle+1; else high=middle; }
    return low-1;
  };
  const openings = sessions.map(session => session.opensAt);
  const rawPosition = (time: number) => {
    const session=sessions[preceding(openings,time)];
    return session ? session.offset+Math.min(session.closesAt-session.opensAt,Math.max(0,time-session.opensAt)) : 0;
  };
  const origin=times.length ? rawPosition(times[0]) : 0;
  const elapsed=times.map(time => rawPosition(time)-origin);
  const corrections=times.map(() => 0);
  // Retain an actual out-of-session baseline as a distinct point, not a
  // fictitious auction or a whole weekend of horizontal space.
  for (let index=1;index<times.length;index++) corrections[index]=corrections[index-1]
    +(elapsed[index]===elapsed[index-1] ? Math.min(CLEARING_MILLISECONDS,times[index]-times[index-1]) : 0);
  const position=(time: number) => rawPosition(time)-origin+(corrections[preceding(times,time)] ?? 0);
  const positions=times.map((time,index) => elapsed[index]+corrections[index]);
  const scheduled=times.map(time => {
    const session=sessions[preceding(openings,time)];
    return !!session && time>=session.opensAt && time<session.closesAt && time%CLEARING_MILLISECONDS===0;
  });
  return { positions, elapsed, scheduled, sessions, position, span:Math.max(1,positions.at(-1) ?? 0) };
}

/** Sequence counts include real records omitted by aggregation. Compare those
 * counts with expected trading slots, never with sampled timestamp spacing. */
export function recordedContinuity(points: MarketHistoryPoint[], sequences: number[]) {
  if (points.length!==sequences.length || sequences.some(value => !Number.isInteger(value))) throw new Error("Missing recorded RXC sequence");
  const scale=tradingTimeScale(points);
  let segment=0;
  return points.map((point,index) => {
    if (index && (!scale.scheduled[index-1] || !scale.scheduled[index]
      || sequences[index]-sequences[index-1] !== (scale.elapsed[index]-scale.elapsed[index-1])/CLEARING_MILLISECONDS)) segment++;
    return { ...point, segment };
  });
}
