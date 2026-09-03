import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './server-harness.mjs';
import {createHash} from 'node:crypto';
const DAY=24*60*60*1000;
test('sessions survive cache eviction and expire exactly after thirty days',async()=>{
 const h=await harness(),login=h.request({action:'login',proof:h.proof}).result;
 assert.equal(login.expiresAt-h.now(),30*DAY);
 h.cache.clear();h.advance(30*DAY-1);
 assert.equal(h.request({action:'read',token:login.token}).ok,true);
 h.advance(1);
 assert.equal(h.request({action:'read',token:login.token}).code,'SESSION');
 assert.equal(Object.keys(h.props).filter(key=>key.startsWith('session:')).length,0);
});
test('logout revokes only its own persistent session and password changes revoke all sessions',async()=>{
 const h=await harness(),a=h.request({action:'login',proof:h.proof}).result,b=h.request({action:'login',proof:h.proof}).result;
 assert.equal(h.request({action:'logout',token:a.token}).ok,true);
 assert.equal(h.request({action:'read',token:a.token}).code,'SESSION');
 assert.equal(h.request({action:'read',token:b.token}).ok,true);
 h.props.AUTH_HASH='different-password-hash';
 assert.equal(h.request({action:'read',token:b.token}).code,'SESSION');
});
test('login removes expired sessions without altering configuration',async()=>{
 const h=await harness();h.request({action:'login',proof:h.proof});h.advance(30*DAY);
 const authHash=h.props.AUTH_HASH;h.request({action:'login',proof:h.proof});
 assert.equal(Object.keys(h.props).filter(key=>key.startsWith('session:')).length,1);
 assert.equal(h.props.AUTH_HASH,authHash);assert.equal(h.props.SPREADSHEET_ID,'test');
});
test('old six-hour sessions remain valid during deployment and can be revoked',async()=>{
 const h=await harness(),token='c'.repeat(64),key='session:'+createHash('sha256').update(token+h.props.AUTH_HASH).digest('hex');
 h.cache.set(key,{value:'1',expires:h.now()+21600000});
 assert.equal(h.request({action:'read',token}).ok,true);
 assert.equal(h.request({action:'logout',token}).ok,true);
 assert.equal(h.request({action:'read',token}).code,'SESSION');
});
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
