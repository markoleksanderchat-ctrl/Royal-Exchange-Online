import assert from 'node:assert/strict';
import test from 'node:test';
import {tradingTimeScale,recordedContinuity} from '../lib/trading-time.ts';
import {tradingTimeAxis} from '../lib/chart-scale.ts';
import {splitHistory} from '../lib/history-series.ts';
const points=times=>times.map((time,index)=>({time,value:1000+index,segment:index}));

test('weekends, holidays, DST and early closes compress to one actual clearing interval',()=>{
  for(const times of [
    ['2026-10-09T19:55:00Z','2026-10-12T13:30:00Z'],
    ['2026-10-30T19:55:00Z','2026-11-02T14:30:00Z'],
    ['2026-11-25T20:55:00Z','2026-11-27T14:30:00Z'],
    ['2026-11-27T17:55:00Z','2026-11-30T14:30:00Z'],
    ['2026-07-02T19:55:00Z','2026-07-06T13:30:00Z'],
  ]) {
    const original=points(times),scale=tradingTimeScale(original),connected=recordedContinuity(original,[10,11]);
    assert.deepEqual(scale.positions,[0,300000]);
    assert.equal(splitHistory(connected).length,1);
    assert.deepEqual(connected.map(({time,value})=>({time,value})),original.map(({time,value})=>({time,value})));
  }
});

test('missing auctions and entire missing trading sessions retain open-time space and line breaks',()=>{
  const intraday=points(['2026-10-30T14:50:00Z','2026-10-30T15:00:00Z']);
  assert.deepEqual(tradingTimeScale(intraday).positions,[0,600000]);
  assert.equal(splitHistory(recordedContinuity(intraday,[10,11])).length,2);
  const missingDay=points(['2026-10-30T19:55:00Z','2026-11-03T14:30:00Z']);
  assert.deepEqual(tradingTimeScale(missingDay).positions,[0,395*60000]);
  assert.equal(splitHistory(recordedContinuity(missingDay,[10,11])).length,2);
  const missingClose=points(['2026-10-30T19:50:00Z','2026-11-02T14:30:00Z']);
  assert.equal(splitHistory(recordedContinuity(missingClose,[10,11])).length,2);
});

test('aggregation spacing is not mistaken for missing source observations',()=>{
  const sampled=points(['2026-10-30T13:30:00Z','2026-10-30T19:55:00Z','2026-11-02T14:30:00Z','2026-11-02T20:55:00Z']);
  assert.equal(splitHistory(recordedContinuity(sampled,[0,77,78,155])).length,1);
  assert.equal(splitHistory(recordedContinuity(sampled,[0,76,77,154])).length,2,'a real omitted auction still breaks a sampled series');
  assert.throws(()=>recordedContinuity(sampled,[0,77]),/sequence/);
});

test('a closed-market establishment baseline stays distinct without adding a weekend or prices',()=>{
  const original=points(['2026-10-09T21:59:04.974Z','2026-10-12T13:30:00Z','2026-10-12T13:35:00Z']);
  assert.deepEqual(tradingTimeScale(original).positions,[0,300000,600000]);
  assert.deepEqual(splitHistory(recordedContinuity(original,[0,1,2])).map(run=>run.length),[1,2]);
});

test('labels, pointer positions and price coordinates share the same trading-time transform',()=>{
  const original=points(['2026-10-30T13:30:00Z','2026-10-30T19:55:00Z','2026-11-02T14:30:00Z','2026-11-02T20:55:00Z']);
  const scale=tradingTimeScale(original);
  assert.deepEqual(scale.positions,[0,385*60000,390*60000,775*60000]);
  for(const width of [225,800]) {
    const ticks=tradingTimeAxis(original,width,scale);
    assert.deepEqual(ticks.map(tick=>tick.label),['Oct 30','Nov 2']);
    assert.equal(ticks[1].position,scale.positions[2]);
    assert.ok(ticks.every(tick=>tick.position>=0&&tick.position<=scale.span));
  }
  const intraday=points(['2026-11-03T14:30:00Z','2026-11-03T20:55:00Z']);
  const daily=tradingTimeScale(intraday);
  assert.equal(daily.span,385*60000);
  assert.ok(tradingTimeAxis(intraday,600,daily).every(tick=>/AM|PM/.test(tick.label)));
});
