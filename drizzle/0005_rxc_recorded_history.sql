-- Derived index only: original market_ticks and issuer_ticks are never modified.
CREATE TABLE IF NOT EXISTS rxc_history_points (
    seq INTEGER PRIMARY KEY, tick INTEGER NOT NULL UNIQUE, observed_at TEXT NOT NULL UNIQUE CHECK(julianday(observed_at) IS NOT NULL),
    value REAL NOT NULL CHECK(value > 0), segment INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS rxc_history_rollups (
    level INTEGER NOT NULL, bucket INTEGER NOT NULL, first_seq INTEGER NOT NULL, last_seq INTEGER NOT NULL,
    first_json TEXT NOT NULL, low_json TEXT NOT NULL, high_json TEXT NOT NULL, last_json TEXT NOT NULL,
    low REAL NOT NULL, high REAL NOT NULL, observations INTEGER NOT NULL,
    PRIMARY KEY(level,bucket)) WITHOUT ROWID;
WITH ordered AS (
  SELECT tick,observed_at,composite,ROW_NUMBER() OVER (ORDER BY tick)-1 AS seq,LAG(tick) OVER (ORDER BY tick) AS previous_tick FROM market_ticks
), segmented AS (
  SELECT *,MAX(CASE WHEN previous_tick IS NULL OR tick-previous_tick != 5 THEN tick END) OVER (ORDER BY tick) AS segment FROM ordered
)
INSERT OR IGNORE INTO rxc_history_points(seq,tick,observed_at,value,segment) SELECT seq,tick,observed_at,composite,segment FROM segmented;
WITH levels(level,block) AS (VALUES (1,4),(2,16),(3,64),(4,256),(5,1024),(6,4096),(7,16384),(8,65536),(9,262144),(10,1048576)), source AS (
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
