import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureMarketSchema} from '../lib/market-ledger.ts';
import {marketEraActivationStatements} from '../lib/market-era.ts';
import {syncRxcHistoryIndex} from '../lib/rxc-history.ts';
import {SqliteD1} from './sqlite-d1.mjs';
const RealDate=Date;
const worker=(await import('../dist/server/index.js')).default;
async function runScenario(retry){
  let clock=RealDate.parse('2026-11-02T15:03:00Z');
  const db=new SqliteD1(new RealDate(clock));await ensureMarketSchema(db);
  await db.batch(marketEraActivationStatements(db,new RealDate('2026-10-30T13:00:00Z'),'a'.repeat(64)));
  let fault=false;
  db.beforeBatch=statements=>{
    if(retry&&!fault&&statements.some(s=>s.sql.startsWith('INSERT INTO market_ticks'))){
      fault=true;clock+=300000;db.now=clock;throw new Error('Isolated transient database failure');
    }
  };
  globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
  try{
    let completed;
    worker.scheduled({scheduledTime:RealDate.parse('2026-10-30T19:55:00Z')},{DB:db},{waitUntil(promise){completed=promise;}});
    await completed;
    const actual=db.sqlite.prepare('SELECT tick,observed_at FROM market_ticks ORDER BY tick').all();
    assert.equal(actual.length,2,'one baseline and one actual successful auction');
    assert.equal(actual.at(-1).observed_at,retry?'2026-11-02T15:05:00.000Z':'2026-11-02T15:00:00.000Z');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM rxc_history_points').get().n,2);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM market_trade_ticks').get().n,38);
    const before=JSON.stringify(db.sqlite.prepare('SELECT * FROM market_ticks ORDER BY tick').all());
    await syncRxcHistoryIndex(db);await syncRxcHistoryIndex(db);
    assert.equal(JSON.stringify(db.sqlite.prepare('SELECT * FROM market_ticks ORDER BY tick').all()),before);
  }finally{globalThis.Date=RealDate;db.sqlite.close();}
}
test('delayed cron records its execution window without inventing a past clearing',()=>runScenario(false));
test('transient cron failure retries against the new real window without duplicating trades or history',()=>runScenario(true));
