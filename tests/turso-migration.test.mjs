import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LocalSqlite} from '../backend/sqlite.mjs';
import {importBackup,readAccount,modelFingerprint} from '../backend/migration.mjs';
import {TursoDatabase,databaseEndpoint,transactionBatch} from '../backend/turso.mjs';

const model={sources:[{id:'a',name:'Работа',active:true,color:'#123456',order:0},{id:'b',name:'Корзина',active:false,color:'#abcdef',order:1,deletedAt:1700000000000}],entries:[{sourceId:'a',month:'2026-01',amount:12345},{sourceId:'a',month:'2026-02',amount:0},{sourceId:'b',month:'2025-12',amount:99999}]};
const envelope=data=>JSON.stringify({schema:'potok-income-backup',version:1,createdAt:1700000000000,checksum:createHash('sha256').update(JSON.stringify([data.sources,data.entries])).digest('hex'),data});
const account='test-owner-account-0001';

test('SQLite restores exact minor units, zeros, missing months and original trash timestamps',async()=>{
 const db=new LocalSqlite();try{
  const report=await importBackup(db,envelope(model),account);
  assert.equal(report.verified,true);assert.equal(report.trash,1);assert.equal(report.totalMinor,'112344');assert.equal(report.visibleTotalMinor,'12345');
  assert.equal(modelFingerprint(await readAccount(db,account)),modelFingerprint(model));
  assert.equal(db.execute({sql:'SELECT state FROM potok_accounts'}).rows[0].state,'pending_owner');
 }finally{db.close();}
});
test('a retry of an acknowledged or ambiguously acknowledged import never duplicates records',async()=>{
 const db=new LocalSqlite();try{
  const first=await importBackup(db,envelope(model),account),again=await importBackup(db,envelope(model),account);
  assert.equal(first.fingerprint,again.fingerprint);
  assert.equal(db.execute({sql:'SELECT count(*) AS n FROM potok_entries'}).rows[0].n,3);
  const changed=structuredClone(model);changed.entries[0].amount++;
  await assert.rejects(importBackup(db,envelope(changed),account),/different import/);
  assert.equal(modelFingerprint(await readAccount(db,account)),modelFingerprint(model));
 }finally{db.close();}
});
test('bad checksums change nothing and a late SQL failure rolls back the entire imported account',async()=>{
 const db=new LocalSqlite();try{
  const corrupt=JSON.parse(envelope(model));corrupt.data.entries[0].amount++;
  await assert.rejects(importBackup(db,JSON.stringify(corrupt),account),/сумма/);
  assert.equal(db.execute({sql:"SELECT name FROM sqlite_master WHERE type='table'"}).rows.length,0);
  const wrapped={execute:q=>db.execute(q),batch:qs=>db.batch(qs.some(q=>q.sql.startsWith('INSERT INTO potok_accounts'))?[...qs,{sql:'INSERT INTO potok_accounts(id,state,created_at) VALUES (?, ?, ?)',args:[account,'active',1]}]:qs)};
  await assert.rejects(importBackup(wrapped,envelope(model),account),/UNIQUE/);
  assert.equal(db.execute({sql:'SELECT count(*) AS n FROM potok_accounts'}).rows[0].n,0);
  assert.equal(db.execute({sql:'SELECT count(*) AS n FROM potok_entries'}).rows[0].n,0);
 }finally{db.close();}
});
test('separate accounts may have the same source IDs without mixing their records',async()=>{
 const db=new LocalSqlite();try{
  const second=structuredClone(model);second.entries[0].amount=321;
  await importBackup(db,envelope(model),account);await importBackup(db,envelope(second),'second-account-0001');
  assert.equal((await readAccount(db,account)).entries[0].amount,12345);
  assert.equal((await readAccount(db,'second-account-0001')).entries[0].amount,321);
 }finally{db.close();}
});
test('HTTP transport confines tokens to Turso, binds all values, and conditionally rolls back',async()=>{
 assert.equal(databaseEndpoint('libsql://example.turso.io'),'https://example.turso.io/v2/pipeline');
 for(const url of ['https://example.com','http://example.turso.io','https://token@example.turso.io','https://example.turso.io?redirect=x'])assert.throws(()=>databaseEndpoint(url));
 const batch=transactionBatch([{sql:'INSERT INTO example VALUES (?)',args:["value'); DROP TABLE example;--"]}]);
 assert.equal(batch.steps[1].stmt.sql,'INSERT INTO example VALUES (?)');
 assert.equal(batch.steps[1].stmt.args[0].type,'text');
 assert.deepEqual(batch.steps[2].condition,{type:'ok',step:1});
 assert.equal(batch.steps[3].stmt.sql,'ROLLBACK');
 const client=new TursoDatabase({url:'libsql://example.turso.io',token:'x'.repeat(30),fetchImpl:async(url,options)=>{
  assert.equal(options.redirect,'error');
  const requests=JSON.parse(options.body).requests;
  if(requests[1]?.type==='batch')return {ok:true,json:async()=>({results:[{type:'ok',response:{}},{type:'ok',response:{result:{step_results:[{},null,null,{}],step_errors:[null,{message:'constraint'},null,null]}}},{type:'ok',response:{}}]})};
  return {ok:true,json:async()=>({results:[{type:'ok',response:{result:{cols:[{name:'n'}],rows:[[{type:'integer',value:'1'}]],affected_row_count:0}}},{type:'ok',response:{}}]})};
 }});
 assert.equal((await client.execute({sql:'SELECT 1 AS n'})).rows[0].n,1);
 await assert.rejects(client.batch([{sql:'INSERT INTO example VALUES (?)',args:[1]}]),/did not commit/);
});
