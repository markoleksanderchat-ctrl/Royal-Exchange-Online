CREATE TABLE IF NOT EXISTS market_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tick INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS market_anomalies_ends_at_idx ON market_anomalies (ends_at);
--> statement-breakpoint
DROP INDEX IF EXISTS market_anomalies_window_idx;
--> statement-breakpoint
DROP INDEX IF EXISTS issuer_ticks_observed_at_idx;
