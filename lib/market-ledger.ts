import { anomalySchemaStatements, resolveMarketAnomalies } from "./anomalies";
import { getMarketSnapshot, QUIET_EVENT, type ListedCompany, type MarketEvent, type MarketHistoryPoint, type MarketSnapshot } from "./market";

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;
const HISTORY_SAMPLE_MINUTES = 5;

export const marketSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS market_ticks (
    tick INTEGER PRIMARY KEY,
    observed_at TEXT NOT NULL,
    composite REAL NOT NULL,
    total_volume INTEGER NOT NULL,
    model_version TEXT NOT NULL,
    event_json TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS issuer_ticks (
    tick INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    name TEXT NOT NULL,
    sector TEXT NOT NULL,
    influence TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    price REAL NOT NULL,
    volume INTEGER NOT NULL,
    PRIMARY KEY (tick, ticker)
  )`,
  "CREATE INDEX IF NOT EXISTS issuer_ticks_ticker_tick_idx ON issuer_ticks (ticker, tick)",
  "CREATE INDEX IF NOT EXISTS issuer_ticks_observed_at_idx ON issuer_ticks (observed_at)",
  ...anomalySchemaStatements,
] as const;

type IssuerRow = {
  tick: number;
  ticker: string;
  name: string;
  sector: string;
  influence: string;
  observed_at: string;
  price: number;
  volume: number;
};

type SummaryRow = { ticker: string; high: number; low: number };
type PriceRow = { ticker: string; price: number };
type MarketRow = { tick: number; observed_at: string; composite: number; total_volume: number; event_json: string };
type LedgerMeta = { recorded_from: string | null; observations: number };
type HistoryBounds = { min_tick: number | null; max_tick: number | null; observations: number };

export async function ensureMarketSchema(db: D1Database) {
  await db.batch(marketSchemaStatements.map((statement) => db.prepare(statement)));
}

export async function recordMarketTick(db: D1Database, at = new Date()) {
  await ensureMarketSchema(db);
  const anomalies = await resolveMarketAnomalies(db, at.getTime());
  const snapshot = getMarketSnapshot(at, anomalies);
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO market_ticks
      (tick, observed_at, composite, total_volume, model_version, event_json)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(snapshot.tick, snapshot.asOf, snapshot.composite, snapshot.totalVolume, snapshot.modelVersion,
        JSON.stringify({ event: snapshot.event, events: snapshot.events })),
    ...snapshot.companies.map((company) => db.prepare(`INSERT OR IGNORE INTO issuer_ticks
      (tick, ticker, name, sector, influence, observed_at, price, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(snapshot.tick, company.ticker, company.name, company.sector, company.influence,
        snapshot.asOf, company.price, company.volume)),
  ];
  await db.batch(statements);
  return snapshot.tick;
}

export async function getRecordedMarketSnapshot(db: D1Database, at = new Date()): Promise<MarketSnapshot> {
  const currentTick = await recordMarketTick(db, at);
  const cutoffTick = currentTick - DAY_MINUTES;
  const dayStartTick = Math.floor(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) / MINUTE);

  const [currentMarket, currentIssuers, history, ranges, previous, sessionOpen, ledger, previousMarket] = await Promise.all([
    db.prepare("SELECT tick, observed_at, composite, total_volume, event_json FROM market_ticks WHERE tick = ?")
      .bind(currentTick).first<MarketRow>(),
    db.prepare(`SELECT tick, ticker, name, sector, influence, observed_at, price, volume
      FROM issuer_ticks WHERE tick = ? ORDER BY ticker`).bind(currentTick).all<IssuerRow>(),
    db.prepare(`SELECT tick, ticker, name, sector, influence, observed_at, price, volume
      FROM issuer_ticks
      WHERE tick >= ? AND (tick % ? = 0 OR tick = ? OR tick =
        (SELECT MIN(tick) FROM market_ticks WHERE tick >= ?))
      ORDER BY ticker, tick`).bind(cutoffTick, HISTORY_SAMPLE_MINUTES, currentTick, cutoffTick).all<IssuerRow>(),
    db.prepare(`SELECT ticker, MAX(price) AS high, MIN(price) AS low
      FROM issuer_ticks WHERE tick >= ? GROUP BY ticker`).bind(cutoffTick).all<SummaryRow>(),
    db.prepare(`SELECT value.ticker, value.price FROM issuer_ticks value
      INNER JOIN (SELECT ticker, MIN(tick) AS first_tick FROM issuer_ticks WHERE tick >= ? GROUP BY ticker) first
      ON value.ticker = first.ticker AND value.tick = first.first_tick`).bind(cutoffTick).all<PriceRow>(),
    db.prepare(`SELECT value.ticker, value.price FROM issuer_ticks value
      INNER JOIN (SELECT ticker, MIN(tick) AS first_tick FROM issuer_ticks WHERE tick >= ? GROUP BY ticker) first
      ON value.ticker = first.ticker AND value.tick = first.first_tick`).bind(dayStartTick).all<PriceRow>(),
    db.prepare("SELECT MIN(observed_at) AS recorded_from, COUNT(*) AS observations FROM market_ticks").first<LedgerMeta>(),
    db.prepare("SELECT composite FROM market_ticks WHERE tick >= ? ORDER BY tick LIMIT 1")
      .bind(cutoffTick).first<{ composite: number }>(),
  ]);

  if (!currentMarket || currentIssuers.results.length === 0) throw new Error("The recorded market tick is unavailable.");
  const currentByTicker = new Map(currentIssuers.results.map((row) => [row.ticker, row]));
  const historyByTicker = new Map<string, MarketHistoryPoint[]>();
  for (const row of history.results) {
    const points = historyByTicker.get(row.ticker) ?? [];
    points.push({ time: row.observed_at, value: row.price });
    historyByTicker.set(row.ticker, points);
  }
  const rangeByTicker = new Map(ranges.results.map((row) => [row.ticker, row]));
  const previousByTicker = new Map(previous.results.map((row) => [row.ticker, row.price]));
  const openByTicker = new Map(sessionOpen.results.map((row) => [row.ticker, row.price]));

  const companies: ListedCompany[] = currentIssuers.results.map((identity) => {
    const current = currentByTicker.get(identity.ticker) ?? identity;
    const previousClose = previousByTicker.get(identity.ticker) ?? current.price;
    const open = openByTicker.get(identity.ticker) ?? previousClose;
    const change = Number((current.price - previousClose).toFixed(2));
    const changePercent = previousClose === 0 ? 0 : Number(((change / previousClose) * 100).toFixed(2));
    const range = rangeByTicker.get(identity.ticker);
    return {
      ticker: identity.ticker,
      name: identity.name,
      sector: identity.sector,
      influence: identity.influence,
      price: current.price,
      open,
      previousClose,
      change,
      changePercent,
      volume: current.volume,
      high: range?.high ?? current.price,
      low: range?.low ?? current.price,
      history: historyByTicker.get(identity.ticker) ?? [{ time: current.observed_at, value: current.price }],
    };
  });
  const composite = currentMarket.composite;
  const previousComposite = previousMarket?.composite ?? composite;
  const compositeChange = Number((composite - previousComposite).toFixed(2));
  const compositeChangePercent = previousComposite === 0 ? 0
    : Number(((compositeChange / previousComposite) * 100).toFixed(2));
  const advancing = companies.filter((company) => company.change > 0.005).length;
  const declining = companies.filter((company) => company.change < -0.005).length;
  const storedEvent = JSON.parse(currentMarket.event_json) as MarketEvent | { event?: MarketEvent; events?: MarketEvent[] };
  const storedEnvelope = "event" in storedEvent || "events" in storedEvent
    ? storedEvent as { event?: MarketEvent; events?: MarketEvent[] }
    : null;
  const event: MarketEvent = storedEnvelope ? storedEnvelope.event ?? QUIET_EVENT : storedEvent as MarketEvent;
  const events: MarketEvent[] = storedEnvelope?.events ?? (event.id === "none" ? [] : [event]);

  return {
    exchange: "Royal Exchange",
    mode: "autonomous-wall-clock",
    simulation: true,
    modelVersion: "royal-exchange-simulation-v2-anomalies",
    historyMode: "recorded-ledger",
    recordedFrom: ledger?.recorded_from ?? currentMarket.observed_at,
    recordedObservations: ledger?.observations ?? 1,
    currency: "Crown",
    status: "OPEN",
    asOf: currentMarket.observed_at,
    tick: currentMarket.tick,
    nextUpdateAt: new Date((currentMarket.tick + 1) * MINUTE).toISOString(),
    composite,
    compositeChange,
    compositeChangePercent,
    totalVolume: currentMarket.total_volume,
    advancing,
    declining,
    unchanged: companies.length - advancing - declining,
    event,
    events,
    companies,
  };
}

export async function getRecordedIssuerHistory(
  db: D1Database,
  ticker: string,
  periodMinutes: number | null,
  maximumPoints = 120,
): Promise<MarketHistoryPoint[]> {
  const cutoffTick = periodMinutes === null ? null : Math.floor(Date.now() / MINUTE) - periodMinutes;
  const bounds = cutoffTick === null
    ? await db.prepare(`SELECT MIN(tick) AS min_tick, MAX(tick) AS max_tick, COUNT(*) AS observations
      FROM issuer_ticks WHERE ticker = ?`).bind(ticker).first<HistoryBounds>()
    : await db.prepare(`SELECT MIN(tick) AS min_tick, MAX(tick) AS max_tick, COUNT(*) AS observations
      FROM issuer_ticks WHERE ticker = ? AND tick >= ?`).bind(ticker, cutoffTick).first<HistoryBounds>();
  if (!bounds?.observations || bounds.min_tick === null || bounds.max_tick === null) return [];

  const sampleEvery = Math.max(1, Math.ceil(bounds.observations / Math.max(1, maximumPoints - 1)));
  const rows = cutoffTick === null
    ? await db.prepare(`WITH ranked AS (
        SELECT tick, observed_at, price, ROW_NUMBER() OVER (ORDER BY tick) - 1 AS sample_index
        FROM issuer_ticks WHERE ticker = ?
      )
      SELECT observed_at, price FROM ranked
      WHERE sample_index % ? = 0 OR tick = ?
      ORDER BY tick`)
      .bind(ticker, sampleEvery, bounds.max_tick)
      .all<{ observed_at: string; price: number }>()
    : await db.prepare(`WITH ranked AS (
        SELECT tick, observed_at, price, ROW_NUMBER() OVER (ORDER BY tick) - 1 AS sample_index
        FROM issuer_ticks WHERE ticker = ? AND tick >= ?
      )
      SELECT observed_at, price FROM ranked
      WHERE sample_index % ? = 0 OR tick = ?
      ORDER BY tick`)
      .bind(ticker, cutoffTick, sampleEvery, bounds.max_tick)
      .all<{ observed_at: string; price: number }>();
  const points = rows.results.map((row) => ({ time: row.observed_at, value: row.price }));
  if (points.length <= maximumPoints) return points;
  const stride = Math.ceil(points.length / maximumPoints);
  const sampled = points.filter((_point, index) => index % stride === 0);
  const latest = points.at(-1);
  if (latest && sampled.at(-1)?.time !== latest.time) sampled.push(latest);
  return sampled.slice(-maximumPoints);
}
