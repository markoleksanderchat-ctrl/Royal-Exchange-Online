-- Additive schema; activation requires a separate verified backup and operator deployment.
CREATE TABLE IF NOT EXISTS market_era (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL,
    started_at TEXT NOT NULL, baseline_tick INTEGER NOT NULL, backup_sha256 TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS market_sessions (day TEXT PRIMARY KEY, opens_at TEXT NOT NULL,
    closes_at TEXT NOT NULL, last_tick INTEGER NOT NULL, snapshot_json TEXT NOT NULL);

CREATE TRIGGER IF NOT EXISTS market_era_immutable BEFORE UPDATE ON market_era BEGIN SELECT RAISE(ABORT, 'Market era cannot be reset'); END;

CREATE TRIGGER IF NOT EXISTS market_era_no_delete BEFORE DELETE ON market_era BEGIN SELECT RAISE(ABORT, 'Market era cannot be reset'); END;

CREATE TRIGGER IF NOT EXISTS market_sessions_immutable BEFORE UPDATE ON market_sessions BEGIN SELECT RAISE(ABORT, 'Finalized sessions are immutable'); END;

CREATE TRIGGER IF NOT EXISTS market_sessions_no_delete BEFORE DELETE ON market_sessions WHEN EXISTS (SELECT 1 FROM market_era)
    BEGIN SELECT RAISE(ABORT, 'Finalized sessions are immutable'); END;

CREATE TRIGGER IF NOT EXISTS market_current_model BEFORE INSERT ON market_ticks
    WHEN EXISTS (SELECT 1 FROM market_era) AND NEW.model_version != 'royal-exchange-clearing-v5'
    BEGIN SELECT RAISE(ABORT, 'Legacy market writer is disabled'); END;

CREATE TRIGGER IF NOT EXISTS market_session_guard BEFORE INSERT ON market_ticks
    WHEN EXISTS (SELECT 1 FROM market_era) AND NEW.model_version = 'royal-exchange-clearing-v5' AND (
      json_extract(NEW.event_json, '$.clearingSession.closesAt') IS NULL
      OR unixepoch('now') * 1000 >= json_extract(NEW.event_json, '$.clearingSession.closesAt')
      OR unixepoch('now') * 1000 < json_extract(NEW.event_json, '$.clearingSession.opensAt'))
    BEGIN SELECT RAISE(ABORT, 'Market session closed'); END;

CREATE TRIGGER IF NOT EXISTS market_snapshot_model_insert
    BEFORE INSERT ON market_snapshot WHEN EXISTS (SELECT 1 FROM market_era)
      AND json_extract(NEW.snapshot_json, '$.modelVersion') != 'royal-exchange-clearing-v5'
    BEGIN SELECT RAISE(ABORT, 'Legacy snapshot writer is disabled'); END;

CREATE TRIGGER IF NOT EXISTS market_snapshot_model_update
    BEFORE UPDATE ON market_snapshot WHEN EXISTS (SELECT 1 FROM market_era)
      AND json_extract(NEW.snapshot_json, '$.modelVersion') != 'royal-exchange-clearing-v5'
    BEGIN SELECT RAISE(ABORT, 'Legacy snapshot writer is disabled'); END;
