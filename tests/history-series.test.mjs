import test from "node:test";
import assert from "node:assert/strict";
import {normalizeHistory,sampleHistoryExtrema,splitHistory} from "../lib/history-series.ts";
const point=(time,value,segment)=>({time,value,...(segment===undefined?{}:{segment})});
test("transport duplicates and invalid values cannot manufacture flat history",()=>{
  const a=point("2026-10-12T13:30:00Z",1000,1),b=point("2026-10-12T13:35:00Z",1000,1);
  assert.deepEqual(normalizeHistory([b,a,a,point("invalid",100),point("2026-10-12T13:40:00Z",NaN)]),[a,b]);
  assert.deepEqual(normalizeHistory([a,{...a,value:1200}]),[],"conflicting simultaneous prices fail closed");
});
test("coverage metadata breaks chart paths only at genuinely missing observations",()=>{
  const points=[point("2026-10-09T19:50:00Z",1000,1),point("2026-10-09T19:55:00Z",1001,1),
    point("2026-10-12T13:30:00Z",990,1),point("2026-10-12T13:40:00Z",991,2)];
  assert.deepEqual(splitHistory(points).map(p=>p.length),[3,1]);
  assert.equal(splitHistory(points.map(({time,value})=>({time,value}))).length,1,"date changes alone never establish missing data");
});
test("extrema sampling preserves actual endpoints, crash, recovery and chronological order",()=>{
  const points=Array.from({length:10000},(_,i)=>point(new Date(Date.UTC(2026,9,1)+i*300000).toISOString(),i===5001?300:i===5002?2000:1000,1));
  const sampled=sampleHistoryExtrema(points,576);
  assert.ok(sampled.length<=576);assert.equal(sampled[0],points[0]);assert.equal(sampled.at(-1),points.at(-1));
  assert.ok(sampled.includes(points[5001])&&sampled.includes(points[5002]));
  assert.ok(sampled.every(p=>points.includes(p)));assert.ok(sampled.every((p,i)=>!i||p.time>sampled[i-1].time));
});
