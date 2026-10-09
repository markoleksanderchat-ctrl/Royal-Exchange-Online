import {createHash} from 'node:crypto';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import path from 'node:path';

const source=process.argv[2],target=process.argv[3];
if(!source||!target)throw new Error('Usage: node scripts/verify-market-backup.mjs complete-export.sql unused-restore.sqlite');
assert.equal(path.extname(source),'.sql');
await assert.rejects(stat(target),{code:'ENOENT'},'Never overwrite an existing rollback restore');
const contents=await readFile(source),sha256=createHash('sha256').update(contents).digest('hex');
const db=new DatabaseSync(target);
try{
  db.exec('BEGIN');db.exec(contents.toString('utf8'));db.exec('COMMIT');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
  const counts=Object.fromEntries(tables.map(name=>[name,db.prepare('SELECT COUNT(*) AS n FROM "'+name.replaceAll('"','""')+'"').get().n]));
  assert.equal(counts.issuer_market_state,38);assert.ok(counts.market_ticks>0);
  const latest=db.prepare('SELECT tick,observed_at,composite FROM market_ticks ORDER BY tick DESC LIMIT 1').get();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM issuer_ticks WHERE tick=?').get(latest.tick).n,38);
  const cached=db.prepare('SELECT snapshot_json FROM market_snapshot WHERE id=1').get();
  assert.ok(cached,'Complete snapshot cache required');assert.equal(JSON.parse(cached.snapshot_json).companies.length,38);
  const report={source:path.resolve(source),restore:path.resolve(target),sha256,bytes:contents.length,integrity:'ok',tables:counts,latest,verifiedAt:new Date().toISOString()};
  await writeFile(target+'.verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{db.close();}
