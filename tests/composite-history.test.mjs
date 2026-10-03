import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readCompositeHistory, handleCompositeHistory } from "../worker/composite-history.ts";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE market_ticks(tick INTEGER PRIMARY KEY, observed_at TEXT NOT NULL, composite REAL NOT NULL)");
  const statements = [];
  const db = {
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { this.values = values; return this; }, async all() {
        statements.push(this.sql);
        return { results: sqlite.prepare(this.sql).all(...this.values), success: true };
      } };
      return statement;
    },
    batch(queries) { return Promise.all(queries.map((query) => query.all())); },
  };
  return { sqlite, db, statements };
}

test("RXC history returns real observations across gaps with indexed, bounded sampling", async () => {
  const { sqlite, db, statements } = fixture();
  const insert = sqlite.prepare("INSERT INTO market_ticks VALUES (?, ?, ?)");
  const start = Math.floor(Date.parse("2026-09-01T00:00:00Z") / 60000);
  sqlite.exec("BEGIN");
  const values = new Map();
  for (let index = 0; index < 9000; index++) {
    if (index % 7 === 0) continue;
    const tick = start + index * 5;
    const time = new Date(tick * 60000).toISOString();
    const value = 900 + index / 100;
    insert.run(tick, time, value);
    values.set(time, value);
  }
  sqlite.exec("COMMIT");
  const now = (start + 8999 * 5) * 60000;
  for (const period of ["24h", "7d", "30d", "all"]) {
    const points = await readCompositeHistory(db, period, now);
    assert.ok(points.length > 1 && points.length <= 576);
    assert.ok(points.every((point) => values.get(point.time) === point.value), "no interpolated prices");
    assert.ok(points.every((point, i) => !i || Date.parse(point.time) > Date.parse(points[i - 1].time)));
    assert.equal(points.at(-1).time, new Date(now).toISOString());
    if (period === "24h") {
      assert.ok(Date.parse(points[0].time) >= now - 1440 * 60000);
      assert.deepEqual(points, [...values].filter(([time]) => Date.parse(time) >= now - 1440 * 60000)
        .map(([time, value]) => ({ time, value })), "daily history retains every actual clearing");
      assert.ok(points.length > 240, "daily history is denser than the old 120-point cap");
    }
    if (period === "all") assert.equal(points[0].time, new Date((start + 5) * 60000).toISOString());
  }
  assert.ok(statements.every((sql) => !/INSERT|UPDATE|DELETE|CREATE|ALTER/i.test(sql)), "production reader is SELECT-only");
  const sql = statements.find((sql) => sql.startsWith("WITH RECURSIVE"));
  const plan = sqlite.prepare("EXPLAIN QUERY PLAN " + sql).all(start, start + 8999 * 5, 576);
  assert.ok(plan.some((row) => /SEARCH market_ticks USING INTEGER PRIMARY KEY/.test(row.detail)));
  assert.ok(!plan.some((row) => /SCAN market_ticks/.test(row.detail)));
  sqlite.close();
});

test("RXC missing history stays empty; a single observation is not duplicated", async () => {
  const { sqlite, db } = fixture();
  assert.deepEqual(await readCompositeHistory(db, "all"), []);
  sqlite.prepare("INSERT INTO market_ticks VALUES (?, ?, ?)").run(5, "1970-01-01T00:05:00Z", 1000);
  assert.deepEqual(await readCompositeHistory(db, "all"), [{ time: "1970-01-01T00:05:00Z", value: 1000 }]);
  sqlite.close();
});

test("RXC endpoint validates ranges and methods and discloses unavailable history", async () => {
  const request = (query = "", method = "GET") => new Request("https://exchange.example/api/composite-history" + query, { method });
  assert.equal((await handleCompositeHistory(request("?period=__proto__"), {})).status, 400);
  assert.equal((await handleCompositeHistory(request("", "POST"), {})).status, 405);
  const response = await handleCompositeHistory(request(), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { period: "24h", points: [], simulation: true, historyMode: "unavailable" });
  const failed = await handleCompositeHistory(request(), { DB: { batch() { throw new Error("offline"); }, prepare() { return { bind() {} }; } } });
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).historyMode, "unavailable");
});
