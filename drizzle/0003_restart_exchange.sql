-- User-authorized complete exchange restart on 2026-09-02. Applied once by the migration runner.;
--> statement-breakpoint
DROP TABLE IF EXISTS market_snapshot;
--> statement-breakpoint
DROP TABLE IF EXISTS market_trade_ticks;
--> statement-breakpoint
DROP TABLE IF EXISTS issuer_ticks;
--> statement-breakpoint
DROP TABLE IF EXISTS issuer_market_state;
--> statement-breakpoint
DROP TABLE IF EXISTS market_ticks;
--> statement-breakpoint
DROP TABLE IF EXISTS market_anomalies;
--> statement-breakpoint
DROP TABLE IF EXISTS market_anomaly_state;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS market_ticks (
    tick INTEGER PRIMARY KEY,
    observed_at TEXT NOT NULL,
    composite REAL NOT NULL,
    total_volume INTEGER NOT NULL,
    model_version TEXT NOT NULL,
    event_json TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS issuer_ticks (
    tick INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    name TEXT NOT NULL,
    sector TEXT NOT NULL,
    influence TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    price REAL NOT NULL,
    volume INTEGER NOT NULL,
    PRIMARY KEY (tick, ticker)
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issuer_ticks_ticker_tick_idx ON issuer_ticks (ticker, tick);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS market_snapshot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    tick INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS issuer_market_state (
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
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS market_trade_ticks (
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
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS market_trade_ticks_ticker_tick_idx ON market_trade_ticks (ticker, tick);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS market_anomaly_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_anomaly_at INTEGER NOT NULL,
    generation INTEGER NOT NULL DEFAULT 0
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS market_anomalies (
    id TEXT PRIMARY KEY,
    template_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    tone TEXT NOT NULL,
    severity TEXT NOT NULL,
    sector TEXT NOT NULL,
    affected_tickers TEXT NOT NULL,
    peak_impact_percent REAL NOT NULL,
    shape TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    peaks_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS market_anomalies_ends_at_idx ON market_anomalies (ends_at);
