import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './server-harness.mjs';
import {summarize,validateData} from '../model.js';
const DAY=86400000;
const seed={sources:[{id:'a',name:'Работа',active:true,color:'#a78bfa',order:0},{id:'b',name:'Прошлый проект',active:false,color:'#5ed9bc',order:1}],entries:[{sourceId:'a',month:'2024-01',amount:150050},{sourceId:'b',month:'2023-02',amount:220020},{sourceId:'b',month:'2026-09',amount:0}]};
async function setup(){const h=await harness(seed);const login=h.request({action:'login',proof:h.proof}).result;let data=login.data;return {h,get data(){return data;},set data(value){data=value;},token:login.token,mutate(op,revision=data.revision){const result=h.request({action:'mutate',token:login.token,revision,operation:op});if(result.ok)data=result.result;return result;}};}
test('trash excludes all years from the public model and totals; restore exactly preserves status, color, order, zeros and amounts',async()=>{
 const s=await setup(),before=structuredClone(s.data),raw=structuredClone(s.h.storage['Доходы']),allCells=structuredClone(s.h.storage);
 assert.equal(s.mutate({type:'trashSource',sourceId:'b'}).ok,true);
 assert.deepEqual(s.data.sources,[seed.sources[0]]);assert.deepEqual(s.data.entries,[seed.entries[0]]);
 assert.equal(s.data.trash[0].entryCount,2);assert.equal(s.data.trash[0].total,220020);
 assert.equal(s.data.trash[0].expiresAt-s.data.trash[0].deletedAt,30*DAY);
 assert.deepEqual(s.h.storage,allCells);validateData(s.data);assert.equal(summarize(s.data).total,150050);
 assert.equal(s.mutate({type:'restoreSource',sourceId:'b'}).ok,true);
 assert.deepEqual(s.data,before);assert.deepEqual(s.h.storage,allCells);
});
test('scheduled cleanup retains everything one millisecond before 30 days, deletes at exactly 30 days with the site closed, and is idempotent',async()=>{
 const s=await setup();s.mutate({type:'trashSource',sourceId:'b'});const raw=structuredClone(s.h.storage);
 s.h.advance(30*DAY-1);assert.equal(s.h.runCleanup().deleted,0);assert.deepEqual(s.h.storage,raw);
 s.h.advance(1);assert.equal(s.h.runCleanup().deleted,1);assert.equal(s.h.runCleanup().deleted,0);
 assert.ok(!s.h.storage['Источники'].slice(1).some(r=>r[0]==='b'));assert.ok(!s.h.storage['Доходы'].slice(1).some(r=>r[1]==='b'));
 assert.deepEqual(s.h.storage['Источники'][1].slice(0,5),['a','Работа','Активный','#a78bfa',0]);assert.deepEqual(s.h.storage['Доходы'][1],['2024-01','a',1500.5]);
});
test('read enforces the deadline even if the scheduled cleanup was delayed',async()=>{
 const s=await setup();s.mutate({type:'trashSource',sourceId:'b'});s.h.advance(30*DAY);
 const login=s.h.request({action:'login',proof:s.h.proof}).result;
 assert.equal(login.data.trash.length,0);assert.equal(login.data.entries.length,1);assert.equal(login.data.sources.length,1);
});
test('restoration at the last millisecond cancels expiry, and moving it back starts a new thirty days',async()=>{
 const s=await setup();s.mutate({type:'trashSource',sourceId:'b'});const first=s.data.trash[0].deletedAt;
 s.h.advance(30*DAY-1);assert.equal(s.mutate({type:'restoreSource',sourceId:'b'}).ok,true);
 assert.equal(s.mutate({type:'trashSource',sourceId:'b'}).ok,true);assert.equal(s.data.trash[0].deletedAt,first+30*DAY-1);
 s.h.advance(1);assert.equal(s.h.runCleanup().deleted,0);s.h.advance(30*DAY-1);assert.equal(s.h.runCleanup().deleted,1);
});
test('permanent deletion is allowed only from trash and only removes the target and its dependent rows',async()=>{
 const s=await setup();assert.equal(s.mutate({type:'deleteSource',sourceId:'a'}).code,'VALIDATION');
 s.mutate({type:'trashSource',sourceId:'b'});assert.equal(s.mutate({type:'deleteSource',sourceId:'b'}).ok,true);
 assert.deepEqual(s.data.sources,[seed.sources[0]]);assert.deepEqual(s.data.entries,[seed.entries[0]]);assert.deepEqual(s.data.trash,[]);
 assert.equal(s.mutate({type:'restoreSource',sourceId:'b'}).code,'VALIDATION');
});
test('stale tabs, unauthenticated requests, repeated trash actions and attempts to edit a trashed source cannot corrupt data',async()=>{
 const s=await setup(),stale=s.data.revision;s.mutate({type:'trashSource',sourceId:'b'});const raw=structuredClone(s.h.storage);
 for(const operation of [{type:'restoreSource',sourceId:'b'},{type:'deleteSource',sourceId:'b'}]){
  assert.equal(s.h.request({action:'mutate',revision:s.data.revision,operation}).code,'SESSION');
  assert.equal(s.mutate(operation,stale).code,'CONFLICT');
 }
 assert.equal(s.mutate({type:'trashSource',sourceId:'b'}).code,'VALIDATION');
 assert.equal(s.mutate({type:'setSource',source:seed.sources[1]}).code,'VALIDATION');
 assert.equal(s.mutate({type:'setEntries',entries:[{sourceId:'b',month:'2026-09',amount:123}]}).code,'VALIDATION');
 assert.equal(s.mutate({type:'setSource',source:{...seed.sources[1],id:'new'}}).code,'VALIDATION');
 assert.equal(s.h.request({action:'trashMaintenance'}).code,'SESSION');assert.deepEqual(s.h.storage,raw);
});
test('cleanup uses each individual deadline; retained and restored sources are unaffected',async()=>{
 const s=await setup();s.mutate({type:'trashSource',sourceId:'a'});s.h.advance(DAY);s.mutate({type:'trashSource',sourceId:'b'});
 s.h.advance(29*DAY);assert.equal(s.h.runCleanup().deleted,1);assert.ok(s.h.storage['Источники'].some(r=>r[0]==='b'));s.h.advance(DAY);assert.equal(s.h.runCleanup().deleted,1);
});
test('hourly trigger is installed once; trigger failure prevents moving data into an unmaintained trash',async()=>{
 const s=await setup();s.mutate({type:'trashSource',sourceId:'a'});s.mutate({type:'trashSource',sourceId:'b'});assert.equal(s.h.triggers.length,1);assert.equal(s.h.triggers[0].hours,1);
 const blocked=await setup(),raw=structuredClone(blocked.h.storage);blocked.h.failTrigger();assert.equal(blocked.mutate({type:'trashSource',sourceId:'b'}).code,'SERVER');assert.deepEqual(blocked.h.storage,raw);
});
test('failed dependent-row write preserves all records; a later cleanup can safely finish',async()=>{
 const s=await setup();s.mutate({type:'trashSource',sourceId:'b'});const raw=structuredClone(s.h.storage);s.h.advance(30*DAY);s.h.failNextWrite('Доходы');assert.throws(()=>s.h.runCleanup());assert.deepEqual(s.h.storage,raw);assert.equal(s.h.runCleanup().deleted,1);
});
test('failure after removing expired entries is retryable without orphaning retained entries',async()=>{
 const s=await setup();s.mutate({type:'trashSource',sourceId:'b'});s.h.advance(30*DAY);s.h.failNextWrite('Источники');assert.throws(()=>s.h.runCleanup());assert.equal(s.h.runCleanup().deleted,1);assert.deepEqual(s.h.storage['Доходы'][1],['2024-01','a',1500.5]);
});
test('client rejects trash with invalid deadlines or IDs shared with visible sources',()=>{
 const trash={...seed.sources[1],deletedAt:100,expiresAt:100+30*DAY,entryCount:2,total:220020};
 assert.doesNotThrow(()=>validateData({sources:[seed.sources[0]],entries:[seed.entries[0]],trash:[trash]}));
 assert.throws(()=>validateData({...seed,trash:[trash]}));assert.throws(()=>validateData({sources:[],entries:[],trash:[{...trash,expiresAt:101}]}));
});
test('maintenance reports missing Google authorization without changing data, then installs only one trigger after authorization',async()=>{
 const blocked=await setup(),before=structuredClone(blocked.h.storage);blocked.h.requireAuthorization();
 const authorization=blocked.h.request({action:'trashMaintenance',token:blocked.token});
 assert.equal(authorization.ok,true);assert.equal(authorization.result.scheduled,false);assert.match(authorization.result.authorizationUrl,/^https:\/\/script.google.com\//);assert.equal(blocked.h.triggers.length,0);assert.deepEqual(blocked.h.storage,before);
 const ready=await setup(),raw=structuredClone(ready.h.storage);
 for(let i=0;i<2;i++){const result=ready.h.request({action:'trashMaintenance',token:ready.token});assert.equal(result.ok,true);assert.equal(result.result.scheduled,true);assert.equal(Number(result.result.lastRunAt),ready.h.now());}
 assert.equal(ready.h.triggers.length,1);assert.deepEqual(ready.h.storage,raw);
});
