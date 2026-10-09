import { MAX_HISTORY_POINTS, marketSessionStartTick, type MarketHistoryPoint } from "../lib/market.ts";

const PERIOD_MINUTES = { "24h": 1440, "7d": 10080, "30d": 43200, all: null } as const;

/** Reads the existing index ledger. Never clears, records, reconstructs or backfills prices. */
export async function readCompositeHistory(db: D1Database, period: keyof typeof PERIOD_MINUTES, now = Date.now()): Promise<MarketHistoryPoint[]> {
  const minutes = PERIOD_MINUTES[period];
  const newest = await db.prepare("SELECT tick FROM market_ticks ORDER BY tick DESC LIMIT 1").all<{tick: number}>();
  if (!newest.results.length) return [];
  const anchor = Math.min(Math.floor(now / 60_000),newest.results[0].tick);
  const cutoff = minutes === null ? 0 : period === "24h" ? marketSessionStartTick(new Date(anchor * 60_000)) : anchor - minutes;
  const bounds = await db.batch<{ tick: number }>([
    db.prepare("SELECT tick FROM market_ticks WHERE tick >= ? ORDER BY tick ASC LIMIT 1").bind(cutoff),
    db.prepare("SELECT tick FROM market_ticks WHERE tick >= ? ORDER BY tick DESC LIMIT 1").bind(cutoff),
  ]);
  const first = bounds[0].results[0]?.tick;
  const last = bounds[1].results[0]?.tick;
  if (first === undefined || last === undefined) return [];
  // Keep every five-minute observation in a daily range. Longer ranges retain
  // bounded primary-key seeks; missing auctions are never manufactured.
  const rows = await db.prepare(`WITH RECURSIVE samples(n) AS (
    SELECT 0 UNION ALL SELECT n + 1 FROM samples WHERE n + 1 < ?3
  ), targets AS (
    SELECT ?1 + CAST((?2 - ?1) * n / (?3 - 1) AS INTEGER) AS target FROM samples
  ) SELECT observed_at, composite FROM market_ticks WHERE tick IN (
    SELECT (SELECT tick FROM market_ticks WHERE tick >= target AND tick <= ?2 ORDER BY tick ASC LIMIT 1)
    FROM targets
  ) ORDER BY tick`).bind(first, last, MAX_HISTORY_POINTS).all<{ observed_at: string; composite: number }>();
  return rows.results.map((row) => ({ time: row.observed_at, value: row.composite }));
}

export async function handleCompositeHistory(request: Request, env: { DB?: D1Database }) {
  const headers = { "Access-Control-Allow-Origin": "*", "X-Royal-Exchange-Simulation": "true" };
  if (request.method !== "GET") return Response.json({ error: "Only GET is supported." }, { status: 405, headers: { ...headers, Allow: "GET" } });
  const period = new URL(request.url).searchParams.get("period") ?? "24h";
  if (!Object.hasOwn(PERIOD_MINUTES, period)) return Response.json({ error: "period must be 24h, 7d, 30d or all." }, { status: 400, headers });
  try {
    const points = env.DB ? await readCompositeHistory(env.DB, period as keyof typeof PERIOD_MINUTES) : [];
    return Response.json({ period, points, simulation: true, historyMode: env.DB ? "recorded-ledger" : "unavailable" }, {
      headers: { ...headers, "Cache-Control": env.DB ? "public, max-age=20, stale-while-revalidate=20" : "no-store" },
    });
  } catch {
    return Response.json({ period, points: [], simulation: true, historyMode: "unavailable" }, { status: 503, headers: { ...headers, "Cache-Control": "no-store" } });
  }
}
