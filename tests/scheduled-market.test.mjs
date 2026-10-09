import test from "node:test";
import assert from "node:assert/strict";
import { exchangeCalendar, easternInstant, sessionFor } from "../lib/market-calendar.ts";
import { activateMarketEraFromDeployment, marketEraActivationStatements, readMarketEra } from "../lib/market-era.ts";
import { ensureMarketSchema, getRecordedMarketSnapshot } from "../lib/market-ledger.ts";
import { COMPANIES, getMarketSnapshot, marketTickAt } from "../lib/market.ts";
import { readCompositeHistory } from "../worker/composite-history.ts";
import { SqliteD1 } from "./sqlite-d1.mjs";
const at = (day, time) => new Date(easternInstant(day,...time.split(":").map(Number)));
async function fixture(day="2026-10-09",time="09:00") {
  const date=at(day,time), db=new SqliteD1(date); await ensureMarketSchema(db);
  await db.batch(marketEraActivationStatements(db,date,"a".repeat(64))); return db;
}
async function snapshot(db,date) { db.now=date.getTime(); return getRecordedMarketSnapshot(db,date); }

test("published 2026-2028 NYSE holidays, early closes, weekdays and DST",()=>{
  const holidays=["2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25",
    "2027-01-01","2027-01-18","2027-02-15","2027-03-26","2027-05-31","2027-06-18","2027-07-05","2027-09-06","2027-11-25","2027-12-24",
    "2028-01-17","2028-02-21","2028-04-14","2028-05-29","2028-06-19","2028-07-04","2028-09-04","2028-11-23","2028-12-25"];
  for(const day of holidays) assert.equal(sessionFor(day),null,day);
  for(const day of ["2026-11-27","2026-12-24","2027-11-26","2028-07-03","2028-11-24"]) assert.equal(sessionFor(day).closesAt,at(day,"13:00").getTime());
  assert.equal(sessionFor("2026-07-02").closesAt,at("2026-07-02","16:00").getTime());
  assert.ok(sessionFor("2027-12-31"));
  assert.equal(sessionFor("2026-03-06").opensAt,Date.parse("2026-03-06T14:30:00Z"));
  assert.equal(sessionFor("2026-03-09").opensAt,Date.parse("2026-03-09T13:30:00Z"));
  assert.equal(sessionFor("2026-11-02").opensAt,Date.parse("2026-11-02T14:30:00Z"));
  assert.equal(exchangeCalendar(at("2026-10-09","09:29")).open,false);
  assert.equal(exchangeCalendar(at("2026-10-09","09:30")).open,true);
  assert.equal(exchangeCalendar(at("2026-10-09","16:00")).open,false);
  assert.equal(exchangeCalendar(at("2026-10-10","12:00")).nextOpeningAt,at("2026-10-12","09:30").getTime());
  assert.equal(exchangeCalendar(at("2026-10-09","12:45")).progress,0.5);
});

test("operator reset is atomic, backed up, idempotent and preserves unrelated data",async()=>{
  const db=new SqliteD1(); await ensureMarketSchema(db);
  db.sqlite.exec("CREATE TABLE unrelated_player_assets(id TEXT, balance INTEGER); INSERT INTO unrelated_player_assets VALUES('player',1234)");
  db.sqlite.prepare("INSERT INTO market_ticks(tick,observed_at,composite,total_volume,model_version,event_json) VALUES(1,'old',1500,123,'v4','{}')").run();
  assert.throws(()=>marketEraActivationStatements(db,new Date(),"missing"),/backup/);
  await db.batch(marketEraActivationStatements(db,at("2026-10-09","09:00"),"b".repeat(64)));
  const era=await readMarketEra(db), before=db.sqlite.prepare("SELECT * FROM market_snapshot").get();
  await db.batch(marketEraActivationStatements(db,at("2026-10-12","09:00"),"c".repeat(64)));
  assert.deepEqual(await readMarketEra(db),era); assert.deepEqual(db.sqlite.prepare("SELECT * FROM market_snapshot").get(),before);
  assert.equal(db.sqlite.prepare("SELECT balance FROM unrelated_player_assets").get().balance,1234);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM issuer_market_state").get().n,38);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM market_ticks").get().n,1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM market_trade_ticks").get().n,0);
  assert.equal(JSON.parse(before.snapshot_json).composite,1000);
  assert.throws(()=>db.sqlite.exec("DELETE FROM market_era"),/cannot be reset/);
  assert.throws(()=>db.sqlite.prepare("INSERT INTO market_ticks(tick,observed_at,composite,total_volume,model_version,event_json) VALUES(2,'old',1500,1,'v4','{}')").run(),/Legacy/);
  db.sqlite.close();
});

test("deployment without a backup receipt freezes legacy data; failed activation rolls back",async()=>{
  const db=new SqliteD1(); await ensureMarketSchema(db);
  const legacy={...getMarketSnapshot(at("2026-10-09","09:00")),modelVersion:"royal-exchange-clearing-v4",historyMode:"recorded-ledger",composite:1234};
  db.sqlite.prepare("INSERT INTO market_snapshot VALUES (1,?,?)").run(legacy.tick,JSON.stringify(legacy));
  await activateMarketEraFromDeployment(db,at("2026-10-09","10:00"));
  const pending=await snapshot(db,at("2026-10-09","10:00"));
  assert.equal(pending.composite,1234); assert.equal(pending.status,"CLOSED"); assert.equal(pending.session.ready,false);
  assert.equal(await readMarketEra(db),null);
  db.sqlite.exec("CREATE TRIGGER activation_fault BEFORE INSERT ON issuer_ticks BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  await assert.rejects(activateMarketEraFromDeployment(db,at("2026-10-09","10:00"),"d".repeat(64)),/fixture failure/);
  assert.equal(JSON.parse(db.sqlite.prepare("SELECT snapshot_json FROM market_snapshot").get().snapshot_json).composite,1234);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM market_ticks").get().n,0);
  assert.equal(await readMarketEra(db),null); db.sqlite.close();
});

test("early close and holiday restart freeze actual trading until the next session",async()=>{
  const db=await fixture("2026-11-27","09:00");
  const last=await snapshot(db,at("2026-11-27","12:55"));
  const closed=await snapshot(db,at("2026-11-27","13:00"));
  assert.equal(closed.status,"CLOSED"); assert.deepEqual(closed.companies,last.companies);
  assert.equal(db.sqlite.prepare("SELECT closes_at FROM market_sessions").get().closes_at,"2026-11-27T18:00:00.000Z");
  const holiday=await snapshot(db,at("2026-12-25","10:00"));
  assert.deepEqual(holiday.companies,last.companies); assert.equal(holiday.session.nextOpeningAt,at("2026-12-28","09:30").getTime());
  db.sqlite.close();
});

test("closed weekends freeze prices, volume and observations; Monday gaps run once",async()=>{
  const db=await fixture();
  const first=await snapshot(db,at("2026-10-09","09:30"));
  const last=await snapshot(db,at("2026-10-09","15:55"));
  const close=await snapshot(db,at("2026-10-09","16:00"));
  const weekend=await snapshot(db,at("2026-10-11","20:00"));
  assert.deepEqual(close.companies,last.companies); assert.deepEqual(weekend.companies,last.companies);
  assert.equal(weekend.tick,last.tick); assert.equal(weekend.recordedObservations,3);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM market_sessions").get().n,1);
  assert.throws(()=>db.sqlite.exec("UPDATE market_sessions SET last_tick=0"),/immutable/);
  const monday=await snapshot(db,at("2026-10-12","09:30"));
  const repeated=await snapshot(db,at("2026-10-12","09:30"));
  assert.deepEqual(monday,repeated); assert.equal(monday.recordedObservations,4);
  const changes=monday.companies.map(company=>{
    const previous=last.companies.find(old=>old.ticker===company.ticker); assert.equal(company.previousClose,previous.price);
    assert.ok(Math.abs(company.open/previous.price-1)<=0.0351); return company.open/previous.price;
  });
  assert.ok(new Set(changes).size>30);
  const base=COMPANIES.reduce((sum,company)=>sum+company.base*company.weight,0);
  assert.equal(monday.composite,Number((monday.companies.reduce((sum,company)=>sum+company.price*COMPANIES.find(d=>d.ticker===company.ticker).weight,0)/base*1000).toFixed(2)));
  assert.equal(first.status,"OPEN"); db.sqlite.close();
});

test("session close is rechecked inside the database transaction",async()=>{
  const db=await fixture(); await snapshot(db,at("2026-10-09","15:50"));
  const original=db.sqlite.prepare("SELECT * FROM issuer_market_state ORDER BY ticker").all();
  db.beforeBatch=statements=>{ if(statements.some(s=>s.sql.startsWith("INSERT INTO market_ticks"))) db.now=at("2026-10-09","16:00").getTime(); };
  await snapshot(db,at("2026-10-09","15:55"));
  assert.deepEqual(db.sqlite.prepare("SELECT * FROM issuer_market_state ORDER BY ticker").all(),original);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM market_ticks").get().n,2); db.sqlite.close();
});

test("downtime makes one observed auction; old sessions and full intraday history remain immutable",async()=>{
  const db=await fixture();
  const end=at("2026-10-09","16:00").getTime();
  for(let time=at("2026-10-09","09:30").getTime();time<end;time+=300000) await snapshot(db,new Date(time));
  await snapshot(db,new Date(end));
  const friday=db.sqlite.prepare("SELECT snapshot_json FROM market_sessions").get().snapshot_json;
  const archived=JSON.parse(friday); assert.ok(archived.companies.every(company=>company.history.length===78));
  const history=await readCompositeHistory(db,"24h",at("2026-10-11","12:00").getTime()); assert.equal(history.length,78);
  const recovered=await snapshot(db,at("2026-10-15","11:00"));
  assert.equal(recovered.tick,marketTickAt(at("2026-10-15","11:00")));
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM market_ticks").get().n,80);
  assert.equal(db.sqlite.prepare("SELECT snapshot_json FROM market_sessions WHERE day='2026-10-09'").get().snapshot_json,friday);
  assert.equal(recovered.companies[0].trades>0,true); db.sqlite.close();
});
