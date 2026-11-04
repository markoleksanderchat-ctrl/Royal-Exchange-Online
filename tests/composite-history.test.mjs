import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readCompositeHistory, handleCompositeHistory } from "../worker/composite-history.ts";
import { exchangeCalendar, sessionFor } from "../lib/market-calendar.ts";
import { syncRxcHistoryIndex, rxcReadPlan, readRxcHistory } from "../lib/rxc-history.ts";
import { splitHistory } from "../lib/history-series.ts";
import { SqliteD1 } from "./sqlite-d1.mjs";

function fixture() {
  const db=new SqliteD1();
  db.sqlite.exec("CREATE TABLE market_ticks(tick INTEGER PRIMARY KEY, observed_at TEXT NOT NULL, composite REAL NOT NULL)");
  return db;
}
function insert(db,time,value) { db.sqlite.prepare("INSERT INTO market_ticks VALUES(?,?,?)").run(Math.floor(time/300000)*5,new Date(time).toISOString(),value); }
function index(db) { db.sqlite.exec(readFileSync(new URL('../drizzle/0005_rxc_recorded_history.sql',import.meta.url),'utf8')); db.queries=[]; }

test("all four ranges retain every available intraday observation, real ties and real gaps",async()=>{
  const db=fixture(),recorded=[];
  let observation=0;
  for(let day=0;day<30;day++) {
    const session=sessionFor(new Date(Date.parse("2026-10-09T12:00:00Z")+day*86400000).toISOString().slice(0,10));
    if(!session)continue;
    for(let time=session.opensAt;time<session.closesAt;time+=300000) {
      if(observation++===900)continue;
      const value=1000+Math.floor(observation/3)/10;
      insert(db,time,value); recorded.push({time:new Date(time).toISOString(),value});
    }
  }
  const original=db.sqlite.prepare("SELECT * FROM market_ticks ORDER BY tick").all();
  index(db);index(db);
  assert.deepEqual(db.sqlite.prepare("SELECT * FROM market_ticks ORDER BY tick").all(),original,"migration preserves every original price and timestamp");
  const anchor=Date.parse(recorded.at(-1).time);
  for(const [period,minutes] of [["24h",1440],["7d",10080],["30d",43200],["all",null]]) {
    const points=await readCompositeHistory(db,period,anchor+2*86400000);
    const cutoff=minutes===null?0:period==="24h"?exchangeCalendar(anchor).session.opensAt:anchor-minutes*60000;
    assert.deepEqual(points.map(({time,value})=>({time,value})),recorded.filter(p=>Date.parse(p.time)>=cutoff),period+" must retain recorded intraday detail");
    assert.ok(points.every((p,i)=>!i||Date.parse(p.time)>Date.parse(points[i-1].time)));
    assert.equal(points.at(-1).time,recorded.at(-1).time);
  }
  const all=await readCompositeHistory(db,"all",anchor);
  assert.ok(all.some((p,i)=>i&&p.value===all[i-1].value),"genuine unchanged prices are preserved");
  const runs=splitHistory(all);
  assert.equal(runs.length,2,"only the missing auction breaks the history, not twenty complete session boundaries");
  assert.ok(all.some((p,i)=>i&&p.segment===all[i-1].segment&&p.time.slice(0,10)!==all[i-1].time.slice(0,10)),"legitimate overnight prices remain connected");
  assert.ok(db.queries.every(sql=>!/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)/i.test(sql)),"history requests are SELECT-only");
  db.sqlite.close();
});

test("large histories use indexed extrema envelopes, preserve crash/recovery and exact range edges",async()=>{
  const db=fixture(),start=Date.parse("2024-01-02T14:30:00Z");
  db.sqlite.exec("BEGIN");
  for(let i=0;i<100000;i++)insert(db,start+i*300000,i===55001?450:i===55002?1800:1000+(i%11)/100);
  db.sqlite.exec("COMMIT");index(db);
  const all=await readCompositeHistory(db,"all",start+99999*300000);
  assert.ok(all.length<=4096&&all.length>500);
  assert.ok(all.some(p=>p.value===450)&&all.some(p=>p.value===1800),"brief crash and immediate recovery survive aggregation");
  assert.equal(all[0].time,new Date(start).toISOString());assert.equal(all.at(-1).time,new Date(start+99999*300000).toISOString());
  for(const sql of db.queries)assert.ok(!/ROW_NUMBER|COUNT\(\*\)|GROUP BY/.test(sql),"requests never aggregate the full retained ledger");
  const rollupSql=db.queries.find(sql=>sql.includes("FROM rxc_history_rollups"));
  const plan=db.sqlite.prepare("EXPLAIN QUERY PLAN "+rollupSql).all(2,0,4000);
  assert.ok(plan.some(row=>/SEARCH rxc_history_rollups USING PRIMARY KEY/.test(row.detail)),JSON.stringify(plan));
  const edge=await readRxcHistory(db,50001*5,start+99999*300000);
  assert.equal(edge[0].time,new Date(start+49998*300000).toISOString());
  assert.ok(edge.every(p=>Date.parse(p.time)>=start+49998*300000));
  const selected=rxcReadPlan(0,99999).find(part=>part.level>0);
  db.sqlite.prepare("DELETE FROM rxc_history_rollups WHERE level=? AND bucket=?")
    .run(selected.level,Math.floor((selected.from+selected.to)/2));
  await assert.rejects(readCompositeHistory(db,"all",start+99999*300000),/incomplete/);
  db.sqlite.close();
});

test("ordinal query plans cover only requested observations including partial buckets",()=>{
  for(const [first,last]of [[0,0],[3,4100],[7,99999],[17,1000017]]) {
    const plan=rxcReadPlan(first,last);let next=first,total=0;
    for(const part of plan) {
      const size=4**part.level;assert.equal(part.from*size,next);
      next=(part.to+1)*size;total+=part.to-part.from+1;
    }
    assert.equal(next,last+1);assert.ok(total<=4200,"bounded results irrespective of ledger length");
  }
});

test("adaptive aggregation connects complete sessions and retains a true missing auction",async()=>{
  const db=fixture();let sequence=0;
  for(let day=0;day<120;day++) {
    const session=sessionFor(new Date(Date.parse("2026-01-02T12:00:00Z")+day*86400000).toISOString().slice(0,10));
    if(!session)continue;
    for(let time=session.opensAt;time<session.closesAt;time+=300000) {
      const index=sequence++;
      if(index===1200)continue;
      insert(db,time,index===5301?450:index===5302?1800:1000+(index%11)/100);
    }
  }
  assert.ok(sequence>4096);index(db);
  const all=await readCompositeHistory(db,"all",Date.parse("2026-05-04T20:00:00Z"));
  assert.ok(all.length<=4096);
  assert.equal(splitHistory(all).length,2,"complete nights, weekends and holidays never split aggregated history");
  assert.ok(all.some(point=>point.value===450)&&all.some(point=>point.value===1800));
  const source=new Map(db.sqlite.prepare("SELECT observed_at,composite FROM market_ticks").all().map(row=>[row.observed_at,row.composite]));
  assert.ok(all.every(point=>source.get(point.time)===point.value));
  const seek=db.queries.find(sql=>sql.includes('json_each'));
  assert.ok(seek,'selected envelope extrema use indexed ordinal lookups');
  assert.ok(db.sqlite.prepare('EXPLAIN QUERY PLAN '+seek).all('[]').some(row=>/SEARCH rxc_history_points USING (?:COVERING )?INDEX/.test(row.detail)));
  db.sqlite.close();
});

test("missing, stale and single-point history are disclosed rather than synthesized",async()=>{
  const db=fixture();index(db);assert.deepEqual(await readCompositeHistory(db,"all"),[]);
  insert(db,300000,1000);await assert.rejects(readCompositeHistory(db,"all"),/catching up/);
  await syncRxcHistoryIndex(db);
  assert.deepEqual(await readCompositeHistory(db,"all"),[{time:"1970-01-01T00:05:00.000Z",value:1000,segment:0}]);db.sqlite.close();
});

test("RXC endpoint validates inputs and preserves unavailable-history contracts",async()=>{
  const request=(query="",method="GET")=>new Request("https://exchange.example/api/composite-history"+query,{method});
  assert.equal((await handleCompositeHistory(request("?period=__proto__"),{})).status,400);
  assert.equal((await handleCompositeHistory(request("","POST"),{})).status,405);
  const response=await handleCompositeHistory(request(),{});
  assert.deepEqual(await response.json(),{period:"24h",points:[],simulation:true,historyMode:"unavailable"});
  const db=fixture();index(db);insert(db,300000,1000);
  const failed=await handleCompositeHistory(request(),{DB:db});
  assert.equal(failed.status,503);assert.equal((await failed.json()).historyMode,"unavailable");db.sqlite.close();
});

test("edge cache costs one indexed read when warm and invalidates at the next recorded tick",async()=>{
  const saved=globalThis.caches,entries=new Map();
  globalThis.caches={default:{async match(request){return entries.get(request.url)?.clone();},async put(request,response){entries.set(request.url,response.clone());}}};
  const db=fixture();insert(db,Date.parse("2026-11-03T14:30:00Z"),1000);index(db);
  try {
    const request=new Request("https://exchange.example/api/composite-history?period=all");
    const first=await(await handleCompositeHistory(request,{DB:db})).json();db.queries=[];
    assert.deepEqual(await(await handleCompositeHistory(request,{DB:db})).json(),first);
    assert.equal(db.queries.length,1);assert.match(db.queries[0],/ORDER BY tick DESC LIMIT 1/);
    insert(db,Date.parse("2026-11-03T14:35:00Z"),1001);await syncRxcHistoryIndex(db);
    const next=await(await handleCompositeHistory(request,{DB:db})).json();assert.equal(next.points.length,2);
  } finally {globalThis.caches=saved;db.sqlite.close();}
});
