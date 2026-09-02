import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './server-harness.mjs';
test('server enforces authentication, validates writes, detects conflicts and revokes sessions',async()=>{
 const h=await harness({sources:[{id:'a',name:'A',color:'#a78bfa',active:true,order:0}],entries:[{sourceId:'a',month:'2025-01',amount:120000}]});
 assert.equal(h.request({action:'read'}).code,'SESSION');
 assert.equal(h.request({action:'mutate',operation:{type:'setEntries',entries:[]}}).code,'SESSION');
 assert.equal(h.request({action:'login',proof:'a'.repeat(64)}).code,'AUTH');
 const login=h.request({action:'login',proof:h.proof}).result;assert.ok(login.token);assert.equal(login.data.entries[0].amount,120000);
 const token=login.token,revision=login.data.revision;
 assert.equal(h.request({action:'mutate',token,revision:'stale',operation:{type:'setEntries',entries:[]}}).code,'CONFLICT');
 const invalid=h.request({action:'mutate',token,revision,operation:{type:'setEntries',entries:[{sourceId:'a',month:'2025-02',amount:-5}]}});assert.equal(invalid.code,'VALIDATION');
 assert.equal(h.request({action:'read',token}).result.revision,revision);
 const saved=h.request({action:'mutate',token,revision,operation:{type:'setEntries',entries:[{sourceId:'a',month:'2025-01',amount:0},{sourceId:'a',month:'2025-02',amount:50001}]}});
 assert.equal(saved.ok,true);assert.equal(saved.result.entries[0].amount,0);assert.equal(saved.result.entries[1].amount,50001);
 assert.equal(h.request({action:'mutate',token,revision,operation:{type:'setEntries',entries:[{sourceId:'a',month:'2025-03',amount:1}]}}).code,'CONFLICT');
 h.request({action:'logout',token});assert.equal(h.request({action:'read',token}).code,'SESSION');
});
test('invalid manual sheet values fail closed',async()=>{const h=await harness();h.storage['Источники'].push(['a','A','Неизвестно','#a78bfa',0]);const login=h.request({action:'login',proof:h.proof});assert.equal(login.code,'SCHEMA');});
