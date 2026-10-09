import { buildMarketSnapshot, COMPANIES, frozenCompany, initialIssuerState, MARKET_MODEL_VERSION, marketTickAt } from "./market.ts";
export const MARKET_ERA = 1;
export type MarketEra = { version: number; started_at: string; baseline_tick: number; backup_sha256: string };
export const scheduledSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS market_era (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL,
    started_at TEXT NOT NULL, baseline_tick INTEGER NOT NULL, backup_sha256 TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS market_sessions (day TEXT PRIMARY KEY, opens_at TEXT NOT NULL,
    closes_at TEXT NOT NULL, last_tick INTEGER NOT NULL, snapshot_json TEXT NOT NULL)`,
  `CREATE TRIGGER IF NOT EXISTS market_era_immutable BEFORE UPDATE ON market_era BEGIN SELECT RAISE(ABORT, 'Market era cannot be reset'); END`,
  `CREATE TRIGGER IF NOT EXISTS market_era_no_delete BEFORE DELETE ON market_era BEGIN SELECT RAISE(ABORT, 'Market era cannot be reset'); END`,
  `CREATE TRIGGER IF NOT EXISTS market_sessions_immutable BEFORE UPDATE ON market_sessions BEGIN SELECT RAISE(ABORT, 'Finalized sessions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS market_sessions_no_delete BEFORE DELETE ON market_sessions WHEN EXISTS (SELECT 1 FROM market_era)
    BEGIN SELECT RAISE(ABORT, 'Finalized sessions are immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS market_current_model BEFORE INSERT ON market_ticks
    WHEN EXISTS (SELECT 1 FROM market_era) AND NEW.model_version != '${MARKET_MODEL_VERSION}'
    BEGIN SELECT RAISE(ABORT, 'Legacy market writer is disabled'); END`,
  `CREATE TRIGGER IF NOT EXISTS market_session_guard BEFORE INSERT ON market_ticks
    WHEN EXISTS (SELECT 1 FROM market_era) AND NEW.model_version = '${MARKET_MODEL_VERSION}' AND (
      json_extract(NEW.event_json, '$.clearingSession.closesAt') IS NULL
      OR unixepoch('now') * 1000 >= json_extract(NEW.event_json, '$.clearingSession.closesAt')
      OR unixepoch('now') * 1000 < json_extract(NEW.event_json, '$.clearingSession.opensAt'))
    BEGIN SELECT RAISE(ABORT, 'Market session closed'); END`,
  ...["INSERT", "UPDATE"].map(operation => `CREATE TRIGGER IF NOT EXISTS market_snapshot_model_${operation.toLowerCase()}
    BEFORE ${operation} ON market_snapshot WHEN EXISTS (SELECT 1 FROM market_era)
      AND json_extract(NEW.snapshot_json, '$.modelVersion') != '${MARKET_MODEL_VERSION}'
    BEGIN SELECT RAISE(ABORT, 'Legacy snapshot writer is disabled'); END`),
] as const;

export async function readMarketEra(db: D1Database) {
  const era = await db.prepare("SELECT version, started_at, baseline_tick, backup_sha256 FROM market_era WHERE id = 1").first<MarketEra>();
  if (era && (era.version !== MARKET_ERA || !/^[a-f0-9]{64}$/i.test(era.backup_sha256))) throw new Error("Invalid market era; recovery is required");
  return era;
}

/** Set only by an operator deployment after verifying the frozen database backup.
 * Remove the deployment variable immediately after activation. Requests cannot
 * supply it, and ordinary deployments/restarts never activate a missing era.
 */
export async function activateMarketEraFromDeployment(db: D1Database, at: Date, backupSha256?: string) {
  if (!backupSha256) return;
  if (!/^[a-f0-9]{64}$/i.test(backupSha256)) throw new Error("Invalid operator backup receipt");
  if (await readMarketEra(db)) return;
  await db.batch(marketEraActivationStatements(db, at, backupSha256.toLowerCase()));
}

/** Operator-only activation. The SQL guards and single batch make retries harmless. */
export function marketEraActivationStatements(db: D1Database, at: Date, backupSha256: string) {
  if (!/^[a-f0-9]{64}$/i.test(backupSha256)) throw new Error("A verified complete database backup is required");
  const tick = marketTickAt(at), startedAt = at.toISOString();
  const states = COMPANIES.map(definition => ({ ...initialIssuerState(definition, definition.base, tick), sessionDay: "" }));
  const companies = COMPANIES.map((definition, index) => ({ ...frozenCompany(definition, states[index]),
    history: [{ time: startedAt, value: definition.base }] }));
  const snapshot = buildMarketSnapshot(at, companies, [], "recorded-ledger", startedAt, 1, startedAt);
  snapshot.asOf = startedAt;
  const empty = "NOT EXISTS (SELECT 1 FROM market_era WHERE id = 1)";
  const statements = ["market_snapshot", "market_trade_ticks", "issuer_market_state", "issuer_ticks", "market_ticks",
    "market_anomalies", "market_anomaly_state", "market_sessions"].map(table => db.prepare(`DELETE FROM ${table} WHERE ${empty}`));
  statements.push(db.prepare(`INSERT INTO market_ticks (tick, observed_at, composite, total_volume, model_version, event_json)
    SELECT ?, ?, 1000, 0, ?, ? WHERE ${empty}`).bind(tick, startedAt, MARKET_MODEL_VERSION, JSON.stringify({ event: snapshot.event, events: [] })));
  for (let index = 0; index < COMPANIES.length; index++) {
    const definition = COMPANIES[index], state = states[index];
    statements.push(db.prepare(`INSERT INTO issuer_ticks (tick,ticker,name,sector,influence,observed_at,price,volume)
      SELECT ?,?,?,?,?,?,?,0 WHERE ${empty}`).bind(tick,definition.ticker,definition.name,definition.sector,definition.influence,startedAt,definition.base));
    statements.push(db.prepare(`INSERT INTO issuer_market_state (ticker,last_tick,last_price,fair_value,earnings_index,
      book_value_index,debt_ratio,dividend_yield,demand_index,supply_index,momentum,volatility,market_maker_inventory,
      session_day,session_open,session_high,session_low,session_volume,previous_close,total_trades)
      SELECT ?,?,?,?,?,?,?,?,1,1,0,?,0,'',?,?,?,0,?,0 WHERE ${empty}`)
      .bind(state.ticker,tick,state.lastPrice,state.fairValue,state.earningsIndex,state.bookValueIndex,state.debtRatio,state.dividendYield,
        state.volatility,state.lastPrice,state.lastPrice,state.lastPrice,state.lastPrice));
  }
  statements.push(db.prepare(`INSERT INTO market_snapshot(id,tick,snapshot_json) SELECT 1,?,? WHERE ${empty}`).bind(tick,JSON.stringify(snapshot)));
  statements.push(db.prepare(`INSERT INTO market_era(id,version,started_at,baseline_tick,backup_sha256)
    SELECT 1,?,?,?,? WHERE ${empty}`).bind(MARKET_ERA,startedAt,tick,backupSha256));
  return statements;
}
