import { anomalySchemaStatements, resolveMarketAnomalies } from "./anomalies.ts";
import {
  buildMarketSnapshot,
  COMPANIES,
  initialIssuerState,
  MARKET_MODEL_VERSION,
  MARKET_SESSION_MINUTES,
  marketSessionStartTick,
  marketTickAt,
  MINUTE,
  QUIET_EVENT,
  runClearingSession,
  type IssuerMarketState,
  type ListedCompany,
  type MarketEvent,
  type MarketHistoryPoint,
  type MarketSnapshot,
} from "./market.ts";

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
  `CREATE TABLE IF NOT EXISTS market_snapshot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    tick INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS issuer_market_state (
    ticker TEXT PRIMARY KEY,
    last_tick INTEGER NOT NULL,
    last_price REAL NOT NULL,
    fair_value REAL NOT NULL,
    earnings_index REAL NOT NULL,
    book_value_index REAL NOT NULL,
    debt_ratio REAL NOT NULL,
    dividend_yield REAL NOT NULL,
    demand_index REAL NOT NULL,
    supply_index REAL NOT NULL,
    momentum REAL NOT NULL,
    volatility REAL NOT NULL,
    market_maker_inventory INTEGER NOT NULL,
    session_day TEXT NOT NULL,
    session_open REAL NOT NULL,
    session_high REAL NOT NULL,
    session_low REAL NOT NULL,
    session_volume INTEGER NOT NULL,
    previous_close REAL NOT NULL,
    total_trades INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS market_trade_ticks (
    tick INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    price REAL NOT NULL,
    bid REAL NOT NULL,
    ask REAL NOT NULL,
    quantity INTEGER NOT NULL,
    notional REAL NOT NULL,
    trade_count INTEGER NOT NULL,
    buyer_mix TEXT NOT NULL,
    seller_mix TEXT NOT NULL,
    fair_value REAL NOT NULL,
    earnings_index REAL NOT NULL,
    demand_index REAL NOT NULL,
    supply_index REAL NOT NULL,
    session_day TEXT NOT NULL,
    session_open REAL NOT NULL,
    session_high REAL NOT NULL,
    session_low REAL NOT NULL,
    session_volume INTEGER NOT NULL,
    previous_close REAL NOT NULL,
    PRIMARY KEY (tick, ticker)
  )`,
  "CREATE INDEX IF NOT EXISTS market_trade_ticks_ticker_tick_idx ON market_trade_ticks (ticker, tick)",
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

type StateRow = {
  ticker: string;
  last_tick: number;
  last_price: number;
  fair_value: number;
  earnings_index: number;
  book_value_index: number;
  debt_ratio: number;
  dividend_yield: number;
  demand_index: number;
  supply_index: number;
  momentum: number;
  volatility: number;
  market_maker_inventory: number;
  session_day: string;
  session_open: number;
  session_high: number;
  session_low: number;
  session_volume: number;
  previous_close: number;
  total_trades: number;
};

type TradeRow = {
  ticker: string;
  bid: number;
  ask: number;
  trade_count: number;
  fair_value: number;
  session_open: number;
  session_high: number;
  session_low: number;
  session_volume: number;
  previous_close: number;
};

type SummaryRow = { ticker: string; high: number; low: number };
type MarketRow = { tick: number; observed_at: string; composite: number; total_volume: number; model_version: string; event_json: string };
type LedgerMeta = { recorded_from: string | null; observations: number };
type ModelMeta = { model_started_at: string | null };
type SnapshotRow = { tick: number; snapshot_json: string };

function stateFromRow(row: StateRow): IssuerMarketState {
  return {
    ticker: row.ticker,
    lastTick: row.last_tick,
    lastPrice: row.last_price,
    fairValue: row.fair_value,
    earningsIndex: row.earnings_index,
    bookValueIndex: row.book_value_index,
    debtRatio: row.debt_ratio,
    dividendYield: row.dividend_yield,
    demandIndex: row.demand_index,
    supplyIndex: row.supply_index,
    momentum: row.momentum,
    volatility: row.volatility,
    marketMakerInventory: row.market_maker_inventory,
    sessionDay: row.session_day,
    sessionOpen: row.session_open,
    sessionHigh: row.session_high,
    sessionLow: row.session_low,
    sessionVolume: row.session_volume,
    previousClose: row.previous_close,
    totalTrades: row.total_trades,
  };
}

export async function ensureMarketSchema(db: D1Database) {
  await db.batch(marketSchemaStatements.map((statement) => db.prepare(statement)));
}

export async function recordMarketTick(db: D1Database, at = new Date()) {
  const tick = marketTickAt(at);
  const existing = await db.prepare("SELECT tick FROM market_ticks WHERE tick = ?").bind(tick).first<{ tick: number }>();
  if (existing) return existing.tick;

  const [anomalies, states] = await Promise.all([
    resolveMarketAnomalies(db, tick * MINUTE),
    db.prepare("SELECT * FROM issuer_market_state ORDER BY ticker").all<StateRow>(),
  ]);
  const stateByTicker = new Map(states.results.map((row) => [row.ticker, stateFromRow(row)]));
  const missing = COMPANIES.filter((company) => !stateByTicker.has(company.ticker));
  const seeds = missing.length === 0 ? [] : await db.batch<{ price: number }>(missing.map((company) =>
    db.prepare("SELECT price FROM issuer_ticks WHERE ticker = ? ORDER BY tick DESC LIMIT 1").bind(company.ticker)));
  const latestByTicker = new Map(missing.map((company, index) => [company.ticker, seeds[index].results[0]?.price]));
  const newestStateTick = Math.max(0, ...states.results.map((row) => row.last_tick));
  if (newestStateTick > tick) return newestStateTick;

  const results = COMPANIES.map((definition) => {
    const previous = stateByTicker.get(definition.ticker)
      ?? initialIssuerState(definition, latestByTicker.get(definition.ticker) ?? definition.base, tick - MARKET_SESSION_MINUTES);
    return runClearingSession(definition, previous, tick, anomalies);
  });
  const snapshot = buildMarketSnapshot(new Date(tick * MINUTE), results.map((result) => result.company), anomalies);
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO market_ticks
      (tick, observed_at, composite, total_volume, model_version, event_json)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(tick, snapshot.asOf, snapshot.composite, snapshot.totalVolume, MARKET_MODEL_VERSION,
        JSON.stringify({ event: snapshot.event, events: snapshot.events })),
  ];

  for (const result of results) {
    const { company, state, trade } = result;
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO issuer_ticks
        (tick, ticker, name, sector, influence, observed_at, price, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(tick, company.ticker, company.name, company.sector, company.influence,
          snapshot.asOf, company.price, company.volume),
      db.prepare(`INSERT OR IGNORE INTO market_trade_ticks
        (tick, ticker, observed_at, price, bid, ask, quantity, notional, trade_count,
         buyer_mix, seller_mix, fair_value, earnings_index, demand_index, supply_index,
         session_day, session_open, session_high, session_low, session_volume, previous_close)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(tick, company.ticker, trade.observedAt, trade.price, trade.bid, trade.ask,
          trade.quantity, trade.notional, trade.tradeCount, JSON.stringify(trade.buyerMix), JSON.stringify(trade.sellerMix),
          trade.fairValue, trade.earningsIndex, trade.demandIndex, trade.supplyIndex,
          state.sessionDay, state.sessionOpen, state.sessionHigh, state.sessionLow, state.sessionVolume, state.previousClose),
      db.prepare(`INSERT INTO issuer_market_state
        (ticker, last_tick, last_price, fair_value, earnings_index, book_value_index,
         debt_ratio, dividend_yield, demand_index, supply_index, momentum, volatility,
         market_maker_inventory, session_day, session_open, session_high, session_low,
         session_volume, previous_close, total_trades, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(ticker) DO UPDATE SET
          last_tick = excluded.last_tick,
          last_price = excluded.last_price,
          fair_value = excluded.fair_value,
          earnings_index = excluded.earnings_index,
          book_value_index = excluded.book_value_index,
          debt_ratio = excluded.debt_ratio,
          dividend_yield = excluded.dividend_yield,
          demand_index = excluded.demand_index,
          supply_index = excluded.supply_index,
          momentum = excluded.momentum,
          volatility = excluded.volatility,
          market_maker_inventory = excluded.market_maker_inventory,
          session_day = excluded.session_day,
          session_open = excluded.session_open,
          session_high = excluded.session_high,
          session_low = excluded.session_low,
          session_volume = excluded.session_volume,
          previous_close = excluded.previous_close,
          total_trades = excluded.total_trades,
          updated_at = CURRENT_TIMESTAMP
        WHERE excluded.last_tick > issuer_market_state.last_tick`)
        .bind(state.ticker, state.lastTick, state.lastPrice, state.fairValue, state.earningsIndex, state.bookValueIndex,
          state.debtRatio, state.dividendYield, state.demandIndex, state.supplyIndex, state.momentum, state.volatility,
          state.marketMakerInventory, state.sessionDay, state.sessionOpen, state.sessionHigh, state.sessionLow,
          state.sessionVolume, state.previousClose, state.totalTrades),
    );
  }
  try {
    // A competing recorder must roll back its entire batch, not overwrite the
    // winning tick's state. The primary key is the cross-isolate arbiter.
    await db.batch(statements);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("UNIQUE constraint failed: market_ticks.tick")) throw error;
    const winner = await db.prepare("SELECT tick FROM market_ticks WHERE tick = ?").bind(tick).first();
    if (!winner) throw error;
  }
  return tick;
}

export async function getRecordedMarketSnapshot(db: D1Database, at = new Date()): Promise<MarketSnapshot> {
  const cachedRow = await db.prepare("SELECT tick, snapshot_json FROM market_snapshot WHERE id = 1").first<SnapshotRow>();
  const cached = cachedRow ? JSON.parse(cachedRow.snapshot_json) as MarketSnapshot : null;
  if (cached && cached.tick >= marketTickAt(at)) return cached;
  const currentTick = await recordMarketTick(db, at);
  const cutoffTick = currentTick - DAY_MINUTES;
  const dayStartTick = marketSessionStartTick(at);

  const [currentMarket, currentIssuers, currentTrades, history, ledger, modelMeta, previousMarket] = await Promise.all([
    db.prepare("SELECT tick, observed_at, composite, total_volume, model_version, event_json FROM market_ticks WHERE tick = ?")
      .bind(currentTick).first<MarketRow>(),
    db.prepare(`SELECT tick, ticker, name, sector, influence, observed_at, price, volume
      FROM issuer_ticks WHERE tick = ? ORDER BY ticker`).bind(currentTick).all<IssuerRow>(),
    db.prepare(`SELECT ticker, bid, ask, trade_count, fair_value, session_open, session_high,
      session_low, session_volume, previous_close FROM market_trade_ticks WHERE tick = ? ORDER BY ticker`)
      .bind(currentTick).all<TradeRow>(),
    cached ? Promise.resolve({ results: [] as IssuerRow[] }) : db.prepare(`SELECT tick, ticker, name, sector, influence, observed_at, price, volume
      FROM issuer_ticks
      WHERE tick >= ? AND (tick % ? = 0 OR tick = ? OR tick =
        (SELECT MIN(tick) FROM market_ticks WHERE tick >= ?))
      ORDER BY tick, ticker`).bind(cutoffTick, HISTORY_SAMPLE_MINUTES, currentTick, cutoffTick).all<IssuerRow>(),
    cached ? db.prepare("SELECT COUNT(*) AS observations FROM market_ticks WHERE tick > ? AND tick <= ?")
      .bind(cached.tick, currentTick).first<LedgerMeta>().then((row) => ({
        recorded_from: cached.recordedFrom, observations: cached.recordedObservations + (row?.observations ?? 0),
      })) : db.prepare("SELECT MIN(observed_at) AS recorded_from, COUNT(*) AS observations FROM market_ticks").first<LedgerMeta>(),
    cached && cached.modelVersion === MARKET_MODEL_VERSION ? Promise.resolve({ model_started_at: cached.modelStartedAt }) : db.prepare("SELECT MIN(observed_at) AS model_started_at FROM market_ticks WHERE model_version = ?")
      .bind(MARKET_MODEL_VERSION).first<ModelMeta>(),
    db.prepare("SELECT composite FROM market_ticks WHERE tick < ? ORDER BY tick DESC LIMIT 1")
      .bind(dayStartTick).first<{ composite: number }>(),
  ]);

  if (!currentMarket || currentIssuers.results.length === 0) throw new Error("The recorded market tick is unavailable.");
  const tradeByTicker = new Map(currentTrades.results.map((row) => [row.ticker, row]));
  const historyByTicker = new Map<string, MarketHistoryPoint[]>();
  if (cached) {
    for (const company of cached.companies) {
      historyByTicker.set(company.ticker, company.history.filter((point) => Date.parse(point.time) >= cutoffTick * MINUTE));
    }
    // Read only observations since the previous snapshot, including recovery
    // after a recorder completed but snapshot publication was interrupted.
    const additions = await db.prepare(`SELECT tick, ticker, observed_at, price FROM issuer_ticks
      WHERE tick > ? AND tick <= ? ORDER BY tick, ticker`)
      .bind(Math.max(cached.tick, cutoffTick - 1), currentTick).all<IssuerRow>();
    history.results.push(...additions.results);
  }
  for (const row of history.results) {
    const points = historyByTicker.get(row.ticker) ?? [];
    points.push({ time: row.observed_at, value: row.price });
    historyByTicker.set(row.ticker, points);
  }
  const rangeByTicker = new Map<string, SummaryRow>();
  for (const [ticker, points] of historyByTicker) {
    const prices = points.filter((point) => Date.parse(point.time) >= dayStartTick * MINUTE).map((point) => point.value);
    if (prices.length) rangeByTicker.set(ticker, { ticker, high: Math.max(...prices), low: Math.min(...prices) });
  }
  const companies: ListedCompany[] = currentIssuers.results.map((current) => {
    const quote = tradeByTicker.get(current.ticker);
    const previousClose = quote?.previous_close ?? current.price;
    const change = Number((current.price - previousClose).toFixed(2));
    const changePercent = previousClose === 0 ? 0 : Number(((change / previousClose) * 100).toFixed(2));
    const range = rangeByTicker.get(current.ticker);
    const fallbackSpread = Math.max(0.01, Number((current.price * 0.002).toFixed(2)));
    const bid = quote?.bid ?? Number((current.price - fallbackSpread / 2).toFixed(2));
    const ask = quote?.ask ?? Number((current.price + fallbackSpread / 2).toFixed(2));
    return {
      ticker: current.ticker,
      name: current.name,
      sector: current.sector,
      influence: current.influence,
      price: current.price,
      bid,
      ask,
      spread: Number((ask - bid).toFixed(2)),
      fairValue: quote?.fair_value ?? current.price,
      trades: quote?.trade_count ?? 0,
      open: quote?.session_open ?? current.price,
      previousClose,
      change,
      changePercent,
      volume: quote?.session_volume ?? current.volume,
      high: quote?.session_high ?? range?.high ?? current.price,
      low: quote?.session_low ?? range?.low ?? current.price,
      history: historyByTicker.get(current.ticker) ?? [{ time: current.observed_at, value: current.price }],
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

  const snapshot: MarketSnapshot = {
    exchange: "Royal Exchange",
    mode: "autonomous-wall-clock",
    simulation: true,
    modelVersion: MARKET_MODEL_VERSION,
    modelStartedAt: modelMeta?.model_started_at ?? currentMarket.observed_at,
    historyMode: "recorded-ledger",
    recordedFrom: ledger?.recorded_from ?? currentMarket.observed_at,
    recordedObservations: ledger?.observations ?? 1,
    currency: "Crown",
    status: "OPEN",
    asOf: currentMarket.observed_at,
    tick: currentMarket.tick,
    nextUpdateAt: new Date((currentMarket.tick + MARKET_SESSION_MINUTES) * MINUTE).toISOString(),
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
  await db.prepare(`INSERT INTO market_snapshot (id, tick, snapshot_json) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET tick = excluded.tick, snapshot_json = excluded.snapshot_json
    WHERE excluded.tick > market_snapshot.tick`).bind(currentTick, JSON.stringify(snapshot)).run();
  return snapshot;
}

export async function getRecordedIssuerHistory(
  db: D1Database,
  ticker: string,
  periodMinutes: number | null,
  maximumPoints = 120,
): Promise<MarketHistoryPoint[]> {
  const cutoffTick = periodMinutes === null ? 0 : Math.floor(Date.now() / MINUTE) - periodMinutes;
  const limit = Math.max(1, Math.min(120, Math.floor(maximumPoints)));
  const bounds = await db.batch<{ tick: number }>([
    db.prepare("SELECT tick FROM issuer_ticks WHERE ticker = ? AND tick >= ? ORDER BY tick ASC LIMIT 1").bind(ticker, cutoffTick),
    db.prepare("SELECT tick FROM issuer_ticks WHERE ticker = ? AND tick >= ? ORDER BY tick DESC LIMIT 1").bind(ticker, cutoffTick),
  ]);
  const first = bounds[0].results[0]?.tick;
  const last = bounds[1].results[0]?.tick;
  if (first === undefined || last === undefined) return [];

  // At most 120 indexed seeks, irrespective of retained history size. Each
  // target picks a real observation; gaps never manufacture market prices.
  const rows = await db.prepare(`WITH RECURSIVE samples(n) AS (
      SELECT 0 UNION ALL SELECT n + 1 FROM samples WHERE n + 1 < ?1
    ), targets AS (
      SELECT CASE WHEN ?1 = 1 THEN ?3 ELSE ?2 + CAST((?3 - ?2) * n / (?1 - 1) AS INTEGER) END AS target
      FROM samples
    )
    SELECT observed_at, price FROM issuer_ticks
    WHERE ticker = ?4 AND tick IN (
      SELECT (SELECT tick FROM issuer_ticks
        WHERE ticker = ?4 AND tick >= target AND tick <= ?3 ORDER BY tick ASC LIMIT 1)
      FROM targets
    ) ORDER BY tick`).bind(limit, first, last, ticker).all<{ observed_at: string; price: number }>();
  return rows.results.map((row) => ({ time: row.observed_at, value: row.price }));
}
