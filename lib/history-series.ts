import type { MarketHistoryPoint } from "./market.ts";

/** Keep prices unchanged. Duplicate transport records are not extra observations. */
export function normalizeHistory(input: MarketHistoryPoint[]): MarketHistoryPoint[] {
  const points = input.map(point => ({point,time:Date.parse(point.time)}))
    .filter(({point,time}) => Number.isFinite(point.value) && point.value > 0 && Number.isFinite(time))
    .sort((left, right) => left.time-right.time);
  const unique: MarketHistoryPoint[] = [];
  let previousTime: number | undefined;
  for (const {point,time} of points) {
    const previous = unique.at(-1);
    if (previous && previousTime === time) {
      // Conflicting prices at one instant cannot be rendered as reliable history.
      if (previous.value !== point.value) return [];
      continue;
    }
    unique.push(point); previousTime=time;
  }
  return unique;
}

export function historyBreak(left: MarketHistoryPoint, right: MarketHistoryPoint) {
  if (left.segment !== undefined && right.segment !== undefined) return left.segment !== right.segment;
  // Older issuer clients have no continuity metadata. At least preserve their
  // session boundaries; sampled intraday spacing is not itself a missing tick.
  return new Date(left.time).toLocaleDateString("en-CA", { timeZone: "America/New_York" })
    !== new Date(right.time).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function splitHistory(points: MarketHistoryPoint[]): MarketHistoryPoint[][] {
  const segments: MarketHistoryPoint[][] = [];
  for (const point of points) {
    const segment = segments.at(-1);
    if (!segment || historyBreak(segment.at(-1)!, point)) segments.push([point]);
    else segment.push(point);
  }
  return segments;
}

/** First/low/high/last envelopes; every output is an actual input observation. */
export function sampleHistoryExtrema(points: MarketHistoryPoint[], maximum: number): MarketHistoryPoint[] {
  if (points.length <= maximum) return points;
  if (maximum === 1) return points.slice(-1);
  if (maximum < 6) {
    const selected = new Set([points[0],points.at(-1)!]);
    const low = points.reduce((a,b) => b.value<a.value?b:a),high = points.reduce((a,b) => b.value>a.value?b:a);
    if (maximum===3) selected.add(Math.abs(low.value-points[0].value)>Math.abs(high.value-points[0].value)?low:high);
    if (maximum>=4) { selected.add(low);selected.add(high); }
    if (maximum===5) selected.add(points[Math.floor(points.length/2)]);
    return points.filter(point => selected.has(point));
  }
  const buckets = Math.max(1, Math.floor((maximum - 2) / 4));
  const selected = new Set<MarketHistoryPoint>([points[0], points.at(-1)!]);
  for (let index = 0; index < buckets; index++) {
    const from = 1 + Math.floor((points.length - 2) * index / buckets);
    const to = 1 + Math.floor((points.length - 2) * (index + 1) / buckets);
    const bucket = points.slice(from,to);
    if (!bucket.length) continue;
    selected.add(bucket[0]); selected.add(bucket.at(-1)!);
    selected.add(bucket.reduce((a,b) => b.value < a.value ? b : a));
    selected.add(bucket.reduce((a,b) => b.value > a.value ? b : a));
  }
  return points.filter(point => selected.has(point));
}
