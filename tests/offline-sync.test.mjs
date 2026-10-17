import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineChange,reconcileChange,syncPending} from '../offline-sync.js';
const accountId='offline-account-0001';
const base={sources:[{id:'a',name:'Работа',active:true,color:'#123456',order:0}],entries:[{sourceId:'a',month:'2026-01',amount:100}],revision:'before'};
const change=(month,amount)=>createOfflineChange(accountId,base,{type:'setEntries',entries:[{sourceId:'a',month,amount}]});
const error=code=>Object.assign(new Error(code),{code});
function setup(edit=change('2026-01',200)){
 const pending=[edit];let latest=structuredClone(base),writes=0;
 const store={listChanges:async()=>pending.slice(),complete:async id=>pending.splice(pending.findIndex(x=>x.id===id),1)};
 const api={checkSession:async()=>({accountId}),read:async expected=>{assert.equal(expected,accountId);return structuredClone(latest);},mutate:async(revision,operation,id,expected)=>{
  assert.equal(expected,accountId);assert.equal(id,edit.id);assert.equal(revision,latest.revision);writes++;
  for(const e of operation.entries){latest.entries=latest.entries.filter(x=>x.sourceId!==e.sourceId||x.month!==e.month);if(e.amount!==null)latest.entries.push(e);}latest.revision='after';
 }};
 return {store,api,pending,get latest(){return latest;},set latest(v){latest=v;},get writes(){return writes;}};
}
test('different records merge while conflicting totals remain separate choices, never a sum',()=>{
 const remote={...base,entries:[{sourceId:'a',month:'2026-01',amount:300}]};
 assert.equal(reconcileChange(change('2026-02',200),remote).resolved,true);
 const conflict=reconcileChange(change('2026-01',200),remote);
 assert.equal(conflict.resolved,false);assert.equal(conflict.conflicts[0].local,200);assert.equal(conflict.conflicts[0].server,300);
 assert.equal(reconcileChange(change('2026-01',200),remote,'local').operation.entries[0].amount,200);
 assert.equal(reconcileChange(change('2026-01',200),remote,'server').operation,null);
});
test('explicit zero and deletion differ; unchanged edits cannot undo a remote change',()=>{
 assert.equal(reconcileChange(change('2026-02',0),base).operation.entries[0].amount,0);
 assert.equal(reconcileChange(change('2026-01',null),base).operation.entries[0].amount,null);
 assert.equal(reconcileChange(change('2026-01',100),{...base,entries:[{sourceId:'a',month:'2026-01',amount:300}]}).operation,null);
 assert.throws(()=>change('invalid-month',null));
});
test('independent fields on a source merge and a deleted source is never silently resurrected',()=>{
 const local=createOfflineChange(accountId,base,{type:'setSource',source:{...base.sources[0],name:'Новое имя'}});
 const remote={...base,sources:[{...base.sources[0],color:'#ffffff'}]};
 const planned=reconcileChange(local,remote);assert.equal(planned.resolved,true);assert.equal(planned.operation.source.color,'#ffffff');assert.equal(planned.operation.source.name,'Новое имя');
 assert.equal(reconcileChange(change('2026-01',200),{sources:[],entries:[]},'local').resolved,false);
});
test('network loss after a committed write retains the edit, and retry sends no duplicate',async()=>{
 const h=setup(),mutate=h.api.mutate;
 h.api.mutate=async(...args)=>{await mutate(...args);throw error('NETWORK');};
 assert.equal((await syncPending({accountId,...h})).status,'offline');assert.equal(h.pending.length,1);assert.equal(h.writes,1);
 h.api.mutate=mutate;
 assert.equal((await syncPending({accountId,...h})).status,'synced');assert.equal(h.pending.length,0);assert.equal(h.writes,1);
});
test('revocation before sync or during a write preserves drafts and never accepts a different profile',async()=>{
 const h=setup();h.api.checkSession=async()=>{throw error('SESSION');};
 assert.equal((await syncPending({accountId,...h})).status,'reauthenticate');assert.equal(h.writes,0);assert.equal(h.pending.length,1);
 h.api.checkSession=async()=>({accountId:'other-account-0001'});
 assert.equal((await syncPending({accountId,...h})).status,'wrong-profile');assert.equal(h.writes,0);
 h.api.checkSession=async()=>({accountId});h.api.mutate=async()=>{throw error('SESSION');};
 assert.equal((await syncPending({accountId,...h})).status,'reauthenticate');assert.equal(h.pending.length,1);
});
test('server revision conflicts preserve drafts and a stale user resolution cannot overwrite new data',async()=>{
 const h=setup();h.api.mutate=async()=>{throw error('CONFLICT');};
 assert.equal((await syncPending({accountId,...h})).status,'retry');assert.equal(h.pending.length,1);
 h.latest={...base,revision:'new-server-version',entries:[{sourceId:'a',month:'2026-01',amount:500}]};
 const result=await syncPending({accountId,...h,resolution:{changeId:h.pending[0].id,serverRevision:'old-server-version',preference:'local'}});
 assert.equal(result.status,'conflict');assert.equal(h.pending.length,1);assert.equal(h.writes,0);
});
