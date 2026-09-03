import test from 'node:test';
import assert from 'node:assert/strict';
import {Api,SESSION_KEY} from '../api.js';
import {CONFIG} from '../config.js';
import {harness} from './server-harness.mjs';

function storage(t,value){
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
}
function browser(t){
 const values=new Map();
 storage(t,{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)});
 return values;
}
function connect(t,h){t.mock.method(globalThis,'fetch',async(url,options)=>({ok:true,json:async()=>h.request(JSON.parse(options.body))}));}
const savedSession=()=>({apiUrl:CONFIG.apiUrl,token:'a'.repeat(64),expiresAt:Date.now()+86400000});

test('login survives page and browser recreation; only the session token is stored',async t=>{
 const values=browser(t),h=await harness();connect(t,h);
 const api=new Api(),data=await api.login('test-only-password');
 const saved=JSON.parse(values.get(SESSION_KEY));
 assert.deepEqual(Object.keys(saved).sort(),['apiUrl','expiresAt','token']);
 assert.equal(saved.token,api.token);
 const reopened=new Api();assert.equal(reopened.token,api.token);
 assert.deepEqual(await reopened.read(),data);
 h.cache.clear();assert.deepEqual(await new Api().read(),data);
});
test('temporary network and server failures preserve the saved session for retry',async t=>{
 const values=browser(t),session=savedSession();values.set(SESSION_KEY,JSON.stringify(session));
 const api=new Api();const fetch=t.mock.method(globalThis,'fetch',async()=>{throw new Error('offline');});
 await assert.rejects(api.read(),{code:'NETWORK'});
 assert.equal(new Api().token,session.token);
 fetch.mock.mockImplementation(async()=>({ok:false}));
 await assert.rejects(api.read(),{code:'NETWORK'});assert.equal(api.token,session.token);
 fetch.mock.mockImplementation(async()=>({ok:true,json:async()=>({ok:true,result:{revision:'retried'}})}));
 assert.deepEqual(await api.read(),{revision:'retried'});
});
test('expired or revoked server sessions clear the saved login',async t=>{
 const values=browser(t),h=await harness();connect(t,h);
 const api=new Api();await api.login('test-only-password');
 h.advance(30*86400000);
 await assert.rejects(api.read(),{code:'SESSION'});
 assert.equal(api.token,null);assert.equal(values.has(SESSION_KEY),false);assert.equal(new Api().token,null);
});
test('logout clears local credentials immediately even when the network fails',async t=>{
 const values=browser(t);values.set(SESSION_KEY,JSON.stringify(savedSession()));const api=new Api();
 t.mock.method(globalThis,'fetch',async()=>{throw new Error('offline');});
 const logout=api.logout();assert.equal(api.token,null);assert.equal(values.has(SESSION_KEY),false);
 await assert.rejects(logout,{code:'NETWORK'});assert.equal(new Api().token,null);
});
test('logout also revokes the server token',async t=>{
 browser(t);const h=await harness();connect(t,h);const api=new Api();await api.login('test-only-password');
 const token=api.token;await api.logout();assert.equal(h.request({action:'read',token}).code,'SESSION');
});
test('malformed, expired and wrong-server storage cannot restore a login',t=>{
 const values=browser(t);
 for(const session of [null,{}, {...savedSession(),token:'invalid'},{...savedSession(),expiresAt:Date.now()-1},{...savedSession(),apiUrl:'https://other.invalid'}]){
  values.set(SESSION_KEY,JSON.stringify(session));assert.equal(new Api().token,null);
 }
 values.set(SESSION_KEY,'broken JSON');assert.equal(new Api().token,null);
});
test('unavailable local storage does not break password login',async t=>{
 storage(t,{getItem(){throw new Error('denied');},setItem(){throw new Error('denied');},removeItem(){throw new Error('denied');}});
 const h=await harness();connect(t,h);const api=new Api();await api.login('test-only-password');assert.equal((await api.read()).revision.length,64);
 await api.logout();assert.equal(api.token,null);
});
test('a late response from an old session cannot erase a newer saved login',async t=>{
 const values=browser(t),old=savedSession(),replacement={...old,token:'b'.repeat(64)};
 values.set(SESSION_KEY,JSON.stringify(old));const api=new Api();
 values.set(SESSION_KEY,JSON.stringify(replacement));
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({ok:false,code:'SESSION'})}));
 await assert.rejects(api.read(),{code:'SESSION'});assert.equal(new Api().token,replacement.token);
});
