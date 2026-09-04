import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {harness} from './server-harness.mjs';

const DAY=86400000;
const DELETED_AT=Date.now()-DAY;
const seed={
 sources:[{id:'a',name:'Работа',active:true,color:'#a78bfa',order:0},{id:'b',name:'Архив',active:false,color:'#5ed9bc',order:1,deletedAt:DELETED_AT}],
 entries:[{sourceId:'a',month:'2026-01',amount:100000},{sourceId:'b',month:'2025-01',amount:250000}]
};
const checksum=data=>createHash('sha256').update(JSON.stringify([data.sources,data.entries])).digest('hex');

async function setup(){
 const h=await harness(seed),login=h.request({action:'login',proof:h.proof}).result;
 return {h,token:login.token,data:login.data};
}

test('downloaded backup contains visible and trashed records with a verifiable checksum',async()=>{
 const {h,token}=await setup(),result=h.request({action:'backup',token});
 assert.equal(result.ok,true);assert.equal(result.result.schema,'potok-income-backup');assert.equal(result.result.version,1);
 assert.equal(result.result.reason,'download');assert.deepEqual(result.result.data,seed);
 assert.equal(result.result.checksum,checksum(result.result.data));assert.equal(h.backups.length,0);
});

test('CSV import preserves trash and creates a Drive snapshot before changing sheets',async()=>{
 const {h,token,data}=await setup();
 const incoming={sources:[{id:'a',name:'Работа',active:true,color:'#a78bfa',order:0},{id:'c',name:'Фриланс',active:true,color:'#f5bd72',order:1}],entries:[{sourceId:'a',month:'2026-01',amount:150000},{sourceId:'c',month:'2026-02',amount:50000}]};
 const saved=h.request({action:'mutate',token,revision:data.revision,operation:{type:'importData',data:incoming}});
 assert.equal(saved.ok,true);assert.equal(h.backups.length,1);assert.equal(h.backups[0].trashed,false);
 const snapshot=JSON.parse(h.backups[0].contents);assert.deepEqual(snapshot.data,seed);assert.equal(snapshot.reason,'before-importData');
 assert.deepEqual(saved.result.sources,incoming.sources);assert.deepEqual(saved.result.entries,incoming.entries);
 assert.equal(saved.result.trash[0].id,'b');assert.ok(h.storage['Доходы'].some(row=>row[1]==='b'));
});

test('full restore validates checksum and exactly restores visible and trashed data',async()=>{
 const {h,token,data}=await setup();
 const restored={sources:[{id:'z',name:'Восстановлен',active:true,color:'#ffffff',order:0}],entries:[{sourceId:'z',month:'2024-12',amount:12345}]};
 const backup={schema:'potok-income-backup',version:1,createdAt:h.now()-DAY,checksum:checksum(restored),data:restored};
 const result=h.request({action:'mutate',token,revision:data.revision,operation:{type:'restoreBackup',backup}});
 assert.equal(result.ok,true);assert.deepEqual(result.result.sources,restored.sources);assert.deepEqual(result.result.entries,restored.entries);assert.deepEqual(result.result.trash,[]);
 assert.equal(h.backups.length,1);assert.deepEqual(JSON.parse(h.backups[0].contents).data,seed);
 const stale={...backup,checksum:'0'.repeat(64)};
 assert.equal(h.request({action:'mutate',token,revision:result.result.revision,operation:{type:'restoreBackup',backup:stale}}).code,'VALIDATION');
 assert.equal(h.backups.length,1);
});

test('missing or failed backup prevents destructive changes',async()=>{
 const missing=await setup();delete missing.h.props.BACKUP_FOLDER_ID;
 const noFolder=missing.h.request({action:'mutate',token:missing.token,revision:missing.data.revision,operation:{type:'importData',data:{sources:missing.data.sources,entries:missing.data.entries}}});
 assert.equal(noFolder.code,'BACKUP_SETUP');assert.equal(missing.h.storage['Доходы'][1][2],1000);
 const failed=await setup();failed.h.failNextBackup();
 const noBackup=failed.h.request({action:'mutate',token:failed.token,revision:failed.data.revision,operation:{type:'importData',data:{sources:failed.data.sources,entries:[]}}});
 assert.equal(noBackup.code,'BACKUP');assert.equal(failed.h.storage['Доходы'][1][2],1000);
});

test('failed import write rolls the sheet back while retaining the pre-import backup',async()=>{
 const {h,token,data}=await setup();h.failNextWrite('Доходы');
 const before=structuredClone(h.storage),incoming={sources:data.sources,entries:[]};
 const result=h.request({action:'mutate',token,revision:data.revision,operation:{type:'importData',data:incoming}});
 assert.equal(result.code,'WRITE');assert.deepEqual(h.storage,before);assert.equal(h.backups.length,1);
});

test('daily backups install one trigger and purge only expired Potok snapshots',async()=>{
 const {h,token}=await setup();
 assert.equal(h.request({action:'backupMaintenance',token}).ok,true);
 assert.equal(h.request({action:'backupMaintenance',token}).ok,true);
 const triggers=h.triggers.filter(trigger=>trigger.getHandlerFunction()==='createScheduledBackup');
 assert.equal(triggers.length,1);assert.equal(triggers[0].days,1);assert.equal(triggers[0].hour,4);
 assert.equal(h.backups.length,2);h.advance(90*DAY+1);h.runScheduledBackup();
 assert.equal(h.backups.filter(file=>file.trashed).length,2);assert.equal(h.backups.filter(file=>!file.trashed).length,1);
});
