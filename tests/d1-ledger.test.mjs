import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ensureMarketSchema, getRecordedMarketSnapshot, getRecordedIssuerHistory, recordMarketTick } from '../lib/market-ledger.ts';

// Runs the actual production SQL against SQLite, including transactional batch
// rollback. Query plans catch full-history scans that response tests cannot.
class SqliteD1 {
  constructor(sqlite = new DatabaseSync(':memory:')) { this.sqlite = sqlite; this.queries = []; }
  prepare(sql) {
    const sqlite = this.sqlite;
    const log = (query) => this.queries.push(query);
    return {
      sql, values: [],
      bind(...values) { this.values = values; return this; },
      async all() { log(this.sql); return { results: sqlite.prepare(this.sql).all(...this.values), success: true }; },
      async first() { return (await this.all()).results[0] ?? null; },
      async run() { log(this.sql); return { meta: sqlite.prepare(this.sql).run(...this.values), success: true }; },
    };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      // Deliberately synchronous: a single D1 batch is one atomic transaction.
      for (const statement of statements) {
        this.queries.push(statement.sql);
        const prepared = this.sqlite.prepare(statement.sql);
        results.push(prepared.columns().length ? { results: prepared.all(...statement.values) } : { results: [], meta: prepared.run(...statement.values) });
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

const start = new Date('2026-09-03T12:00:00Z');
const at = (minutes) => new Date(start.getTime() + minutes * 60_000);

test('recording, cached reads and recovery preserve the ledger without rescanning old history', async () => {
  const db = new SqliteD1();
  await ensureMarketSchema(db);
  const first = await getRecordedMarketSnapshot(db, start);
  assert.equal(first.recordedObservations, 1);
  assert.equal(first.companies.length, 38);
  assert.ok(first.companies.every(c => c.history.length === 1));
  db.queries = [];
  assert.deepEqual(await getRecordedMarketSnapshot(db, start), first);
  assert.equal(db.queries.length, 1, 'a warm snapshot is one primary-key read');
  assert.match(db.queries[0], /FROM market_snapshot WHERE id = 1/);

  db.queries = [];
  const second = await getRecordedMarketSnapshot(db, at(5));
  assert.equal(second.recordedObservations, 2);
  assert.ok(second.companies.every(c => c.history.length === 2));
  assert.ok(!db.queries.some(q => /GROUP BY|ROW_NUMBER|CREATE |SELECT price FROM issuer_ticks/.test(q)));
  const historyQuery = db.queries.find(q => /FROM issuer_ticks\s+WHERE tick >/.test(q));
  const plan = db.sqlite.prepare('EXPLAIN QUERY PLAN ' + historyQuery).all(first.tick, second.tick);
  assert.ok(plan.some(row => /SEARCH issuer_ticks.*tick>/.test(row.detail)));
  assert.ok(!plan.some(row => /SCAN issuer_ticks/.test(row.detail)));

  await recordMarketTick(db, at(10));
  await recordMarketTick(db, at(15));
  const recovered = await getRecordedMarketSnapshot(db, at(15));
  assert.equal(recovered.recordedObservations, 4);
  assert.ok(recovered.companies.every(c => c.history.length === 4));
  assert.deepEqual(recovered.companies[0].history.slice(0, 2), second.companies[0].history);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM issuer_ticks').get().n, 38 * 4);
  db.sqlite.close();
});

test('concurrent recorders do not double-count observations or overwrite a committed tick', async () => {
  const db = new SqliteD1();
  await ensureMarketSchema(db);
  const peer = new SqliteD1(db.sqlite);
  const [left, right] = await Promise.all([getRecordedMarketSnapshot(db, start), getRecordedMarketSnapshot(peer, start)]);
  assert.deepEqual(left, right);
  assert.equal(left.recordedObservations, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM market_ticks').get().n, 1);
  const [nextLeft, nextRight] = await Promise.all([getRecordedMarketSnapshot(db, at(5)), getRecordedMarketSnapshot(peer, at(5))]);
  assert.deepEqual(nextLeft, nextRight);
  assert.equal(nextLeft.recordedObservations, 2);
  db.sqlite.close();
});

test('ALL history samples real observations with bounded indexed seeks and correct endpoints', async () => {
  const db = new SqliteD1();
  await ensureMarketSchema(db);
  const insert = db.sqlite.prepare("INSERT INTO issuer_ticks VALUES (?, 'STPL', 'Test', 'Test', 'Test', ?, ?, 1)");
  db.sqlite.exec('BEGIN');
  for (let i = 0; i < 100_000; i++) insert.run(20_000_000 + i * 10, new Date((20_000_000 + i * 10) * 60_000).toISOString(), i + 1);
  db.sqlite.exec('COMMIT');
  const points = await getRecordedIssuerHistory(db, 'STPL', null, 120);
  assert.ok(points.length <= 120);
  assert.equal(points[0].value, 1);
  assert.equal(points.at(-1).value, 100_000);
  assert.ok(points.every((p, i) => i === 0 || p.time > points[i - 1].time));
  assert.ok(!db.queries.some(q => /COUNT\(\*\)|ROW_NUMBER/.test(q)));
  const query = db.queries.at(-1);
  const plan = db.sqlite.prepare('EXPLAIN QUERY PLAN ' + query).all(120, 20_000_000, 20_999_990, 'STPL');
  assert.ok(!plan.some(row => /SCAN issuer_ticks/.test(row.detail)), JSON.stringify(plan));
  assert.ok(plan.filter(row => /SEARCH issuer_ticks/.test(row.detail)).length >= 2);
  assert.deepEqual(await getRecordedIssuerHistory(db, 'STPL', null, 1), points.slice(-1));
  assert.deepEqual(await getRecordedIssuerHistory(db, 'MISSING', null), []);
  db.sqlite.close();
});

test('restart migration removes history, state, notices and snapshots, then starts with one observation', async () => {
  const db = new SqliteD1();
  await ensureMarketSchema(db);
  await getRecordedMarketSnapshot(db, start);
  await getRecordedMarketSnapshot(db, at(5));
  db.sqlite.exec(readFileSync(new URL('./fixtures/restart-exchange.sql', import.meta.url), 'utf8'));
  for (const name of ['market_ticks', 'issuer_ticks', 'market_trade_ticks', 'issuer_market_state', 'market_anomalies', 'market_anomaly_state', 'market_snapshot']) {
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n, 0);
  }
  const fresh = await getRecordedMarketSnapshot(db, at(10));
  assert.equal(fresh.recordedObservations, 1);
  assert.equal(fresh.recordedFrom, at(10).toISOString());
  assert.ok(fresh.companies.every(c => c.history.length === 1));
  const indexes = db.sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='index'").all().map(r => r.name);
  assert.ok(indexes.includes('market_anomalies_ends_at_idx'));
  assert.ok(!indexes.includes('issuer_ticks_observed_at_idx'));
  db.sqlite.close();
});

test('incremental snapshots retain exactly the trailing day across session rollover', async () => {
  const db = new SqliteD1();
  await ensureMarketSchema(db);
  let snapshot;
  for (let tick = 0; tick <= 300; tick++) snapshot = await getRecordedMarketSnapshot(db, at(tick * 5));
  assert.equal(snapshot.recordedObservations, 301);
  assert.equal(snapshot.recordedFrom, start.toISOString());
  assert.ok(snapshot.companies.every(c => c.history.length === 289));
  assert.ok(snapshot.companies.every(c => c.history[0].time === at(60).toISOString()));
  assert.ok(snapshot.companies.every(c => c.history.at(-1).time === snapshot.asOf));
  assert.ok(snapshot.companies.every(c => c.high >= c.price && c.low <= c.price));
  assert.equal(db.queries.filter(q => /MIN\(observed_at\).*COUNT/.test(q)).length, 1);
  const baseline = JSON.parse(db.sqlite.prepare('SELECT event_json FROM market_ticks LIMIT 1').get().event_json);
  assert.ok(baseline.event);
  db.sqlite.close();
});

test('performance migration preserves existing records and supports a fresh installation', async () => {
  const fresh = new SqliteD1();
  for (const file of ['0000_mute_taskmaster.sql', '0001_market_anomalies.sql', '0002_real_market_engine.sql', '0003_bounded_snapshots.sql']) {
    fresh.sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  }
  const before = await getRecordedMarketSnapshot(fresh, start);
  for (const file of ['0001_market_anomalies.sql', '0002_real_market_engine.sql', '0003_bounded_snapshots.sql']) {
    fresh.sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  }
  assert.deepEqual(await getRecordedMarketSnapshot(fresh, start), before);
  assert.equal(fresh.sqlite.prepare('SELECT COUNT(*) AS n FROM issuer_ticks').get().n, 38);
  fresh.sqlite.close();
});
