import { marketSessionStartTick, type MarketHistoryPoint } from "./market.ts";
import { normalizeHistory, sampleHistoryExtrema } from "./history-series.ts";

export const MAX_RXC_HISTORY_POINTS = 4096;
const LEVELS = 10;
const SOURCE_BATCH = 128;
export const rxcHistorySchemaStatements = [
  `CREATE TABLE IF NOT EXISTS rxc_history_points (
    seq INTEGER PRIMARY KEY, tick INTEGER NOT NULL UNIQUE, observed_at TEXT NOT NULL UNIQUE CHECK(julianday(observed_at) IS NOT NULL),
    value REAL NOT NULL CHECK(value > 0), segment INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rxc_history_rollups (
    level INTEGER NOT NULL, bucket INTEGER NOT NULL, first_seq INTEGER NOT NULL, last_seq INTEGER NOT NULL,
    first_json TEXT NOT NULL, low_json TEXT NOT NULL, high_json TEXT NOT NULL, last_json TEXT NOT NULL,
    low REAL NOT NULL, high REAL NOT NULL, observations INTEGER NOT NULL,
    PRIMARY KEY(level,bucket)) WITHOUT ROWID`,
] as const;

type IndexedPoint = { seq: number; tick: number; observed_at: string; value: number; segment: number };
type SourcePoint = { tick: number; observed_at: string; composite: number };
type Envelope = { level: number; bucket: number; first: IndexedPoint; low: IndexedPoint; high: IndexedPoint; last: IndexedPoint; count: number };
type Rollup = { first_json: string; low_json: string; high_json: string; last_json: string; observations: number };
const publicPoint = (point: IndexedPoint): MarketHistoryPoint => ({ time: point.observed_at, value: point.value, segment: point.segment });

export function rxcAppendStatements(db: D1Database, rows: SourcePoint[], previous: IndexedPoint | null): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  const envelopes = new Map<string,Envelope>();
  for (const row of rows) {
    if (previous && row.tick <= previous.tick) throw new Error("RXC observations must be appended in order");
    if (!Number.isFinite(row.composite) || row.composite <= 0 || !Number.isFinite(Date.parse(row.observed_at))) throw new Error("Invalid recorded RXC observation");
    const point: IndexedPoint = { seq: (previous?.seq ?? -1) + 1, tick: row.tick, observed_at: row.observed_at, value: row.composite,
      segment: previous && row.tick - previous.tick === 5 ? previous.segment : row.tick };
    statements.push(db.prepare("INSERT INTO rxc_history_points(seq,tick,observed_at,value,segment) VALUES(?,?,?,?,?)")
      .bind(point.seq,point.tick,point.observed_at,point.value,point.segment));
    for (let level = 1; level <= LEVELS; level++) {
      const bucket = Math.floor(point.seq / 4 ** level), key = level + ":" + bucket;
      const envelope = envelopes.get(key);
      if (!envelope) envelopes.set(key,{level,bucket,first:point,low:point,high:point,last:point,count:1});
      else { envelope.last = point; envelope.count++; if (point.value < envelope.low.value) envelope.low = point; if (point.value > envelope.high.value) envelope.high = point; }
    }
    previous = point;
  }
  for (const envelope of envelopes.values()) {
    const encode = (point: IndexedPoint) => JSON.stringify(publicPoint(point));
    statements.push(db.prepare(`INSERT INTO rxc_history_rollups
      (level,bucket,first_seq,last_seq,first_json,low_json,high_json,last_json,low,high,observations)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(level,bucket) DO UPDATE SET
      last_seq=excluded.last_seq,last_json=excluded.last_json,observations=rxc_history_rollups.observations+excluded.observations,
      low_json=CASE WHEN excluded.low < rxc_history_rollups.low THEN excluded.low_json ELSE rxc_history_rollups.low_json END,
      high_json=CASE WHEN excluded.high > rxc_history_rollups.high THEN excluded.high_json ELSE rxc_history_rollups.high_json END,
      low=MIN(rxc_history_rollups.low,excluded.low),high=MAX(rxc_history_rollups.high,excluded.high)
      WHERE excluded.first_seq > rxc_history_rollups.last_seq`)
      .bind(envelope.level,envelope.bucket,envelope.first.seq,envelope.last.seq,encode(envelope.first),encode(envelope.low),
        encode(envelope.high),encode(envelope.last),envelope.low.value,envelope.high.value,envelope.count));
  }
  return statements;
}

export async function lastRxcPoint(db: D1Database) {
  return db.prepare("SELECT seq,tick,observed_at,value,segment FROM rxc_history_points ORDER BY seq DESC LIMIT 1").first<IndexedPoint>();
}

/** Recovery derives an index from saved observations, never from a simulated past. */
export async function syncRxcHistoryIndex(db: D1Database): Promise<IndexedPoint | null> {
  let previous = await lastRxcPoint(db);
  const rows = await db.prepare("SELECT tick,observed_at,composite FROM market_ticks WHERE tick > ? ORDER BY tick LIMIT ?")
    .bind(previous?.tick ?? -1,SOURCE_BATCH).all<SourcePoint>();
  if (rows.results.length) {
    try { await db.batch(rxcAppendStatements(db,rows.results,previous)); }
    catch (error) {
      // A racing collector's unique sequence/tick rolls its whole batch back.
      if (!(error instanceof Error) || !error.message.includes("UNIQUE constraint failed: rxc_history_points")) throw error;
    }
    previous = await lastRxcPoint(db);
  }
  return previous;
}

/** Aligned ordinal blocks avoid spending samples on closed calendar hours. */
export function rxcReadPlan(first: number, last: number) {
  let level = 0;
  while (level < LEVELS && Math.ceil((last-first+1) / 4 ** level) > MAX_RXC_HISTORY_POINTS) level++;
  const plan: Array<{level:number;from:number;to:number}> = [];
  const cover = (from: number,to: number,depth: number) => {
    if (from > to) return;
    if (depth === 0) { plan.push({level:0,from,to}); return; }
    const block = 4 ** depth, start = Math.ceil(from/block), end = Math.floor((to+1)/block)-1;
    if (start > end) { cover(from,to,depth-1); return; }
    cover(from,start*block-1,depth-1);
    plan.push({level:depth,from:start,to:end});
    cover((end+1)*block,to,depth-1);
  };
  cover(first,last,level);
  return plan;
}

export async function readRxcHistory(db: D1Database, minutes: number | null, now = Date.now()): Promise<MarketHistoryPoint[]> {
  const latestRows = await db.batch<{tick:number}>([
    db.prepare("SELECT tick FROM market_ticks ORDER BY tick DESC LIMIT 1"),
    db.prepare("SELECT tick FROM rxc_history_points ORDER BY seq DESC LIMIT 1"),
  ]);
  const latest = latestRows[0].results[0]?.tick;
  if (latest === undefined) return [];
  if (latestRows[1].results[0]?.tick !== latest) throw new Error("Recorded RXC history index is catching up");
  const anchor = Math.min(Math.floor(now/60_000),latest);
  const cutoff = minutes === null ? 0 : minutes === 1440 ? marketSessionStartTick(new Date(anchor*60_000)) : anchor-minutes;
  const bounds = await db.batch<{seq:number}>([
    db.prepare("SELECT seq FROM rxc_history_points WHERE tick >= ? AND tick <= ? ORDER BY tick LIMIT 1").bind(cutoff,anchor),
    db.prepare("SELECT seq FROM rxc_history_points WHERE tick >= ? AND tick <= ? ORDER BY tick DESC LIMIT 1").bind(cutoff,anchor),
  ]);
  const first = bounds[0].results[0]?.seq,last = bounds[1].results[0]?.seq;
  if (first === undefined || last === undefined) return [];
  const plan = rxcReadPlan(first,last);
  const results = await db.batch(plan.map(part => part.level === 0
    ? db.prepare("SELECT observed_at,value,segment FROM rxc_history_points WHERE seq >= ? AND seq <= ? ORDER BY seq").bind(part.from,part.to)
    : db.prepare("SELECT first_json,low_json,high_json,last_json,observations FROM rxc_history_rollups WHERE level = ? AND bucket >= ? AND bucket <= ? ORDER BY bucket").bind(part.level,part.from,part.to)));
  const points: MarketHistoryPoint[] = [];
  for (let index=0;index<plan.length;index++) {
    if (results[index].results.length !== plan[index].to-plan[index].from+1) throw new Error("Recorded RXC summary index is incomplete");
    if (plan[index].level === 0) for (const row of results[index].results as unknown as IndexedPoint[]) points.push(publicPoint(row));
    else for (const row of results[index].results as unknown as Rollup[]) {
      if (row.observations !== 4 ** plan[index].level) throw new Error("Recorded RXC summary has incomplete coverage");
      points.push(...[row.first_json,row.low_json,row.high_json,row.last_json].map(value => JSON.parse(value) as MarketHistoryPoint));
    }
  }
  if (points.some(point => !Number.isFinite(point.value) || point.value <= 0 || !Number.isFinite(Date.parse(point.time)))) throw new Error("Invalid recorded RXC history");
  return sampleHistoryExtrema(normalizeHistory(points),MAX_RXC_HISTORY_POINTS);
}

/** One-time additive migration: only recorded market_ticks feed the derived index. */
export function rxcHistoryMigrationSql() {
  const levels = Array.from({length:LEVELS},(_,i) => `(${i+1},${4**(i+1)})`).join(",");
  return rxcHistorySchemaStatements.join(";\n\n") + `;
WITH ordered AS (
  SELECT tick,observed_at,composite,ROW_NUMBER() OVER (ORDER BY tick)-1 AS seq,LAG(tick) OVER (ORDER BY tick) AS previous_tick FROM market_ticks
), segmented AS (
  SELECT *,MAX(CASE WHEN previous_tick IS NULL OR tick-previous_tick != 5 THEN tick END) OVER (ORDER BY tick) AS segment FROM ordered
)
INSERT OR IGNORE INTO rxc_history_points(seq,tick,observed_at,value,segment) SELECT seq,tick,observed_at,composite,segment FROM segmented;
WITH levels(level,block) AS (VALUES ${levels}), source AS (
  SELECT p.*,l.level,CAST(p.seq/l.block AS INTEGER) AS bucket,json_object('time',p.observed_at,'value',p.value,'segment',p.segment) AS point_json
  FROM rxc_history_points p CROSS JOIN levels l
), ranked AS (
  SELECT *,ROW_NUMBER() OVER(PARTITION BY level,bucket ORDER BY seq) AS opening,
    ROW_NUMBER() OVER(PARTITION BY level,bucket ORDER BY seq DESC) AS closing,
    ROW_NUMBER() OVER(PARTITION BY level,bucket ORDER BY value,seq) AS low_rank,
    ROW_NUMBER() OVER(PARTITION BY level,bucket ORDER BY value DESC,seq) AS high_rank FROM source
)
INSERT OR IGNORE INTO rxc_history_rollups(level,bucket,first_seq,last_seq,first_json,low_json,high_json,last_json,low,high,observations)
SELECT level,bucket,MIN(seq),MAX(seq),MAX(CASE WHEN opening=1 THEN point_json END),MAX(CASE WHEN low_rank=1 THEN point_json END),
  MAX(CASE WHEN high_rank=1 THEN point_json END),MAX(CASE WHEN closing=1 THEN point_json END),MIN(value),MAX(value),COUNT(*)
FROM ranked GROUP BY level,bucket;
`;
}
