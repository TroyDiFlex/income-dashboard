import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseBackup,verifyBackupChecksum} from '../data-transfer.js';

export const schemaStatements=(await readFile(new URL('./schema.sql',import.meta.url),'utf8'))
  .replace(/^--.*$/gm,'').split(';').map(sql=>sql.trim()).filter(Boolean).map(sql=>({sql,args:[]}));
const validAccount=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{16,64}$/.test(id);
export async function verifiedBackup(text){return verifyBackupChecksum(parseBackup(text));}
export function canonicalModel(data){
  return {
    sources:data.sources.map(s=>({id:s.id,name:s.name,active:s.active,color:s.color,order:s.order,...(s.deletedAt===undefined?{}:{deletedAt:s.deletedAt})})).sort((a,b)=>a.id.localeCompare(b.id)),
    entries:data.entries.map(e=>({sourceId:e.sourceId,month:e.month,amount:e.amount})).sort((a,b)=>a.sourceId.localeCompare(b.sourceId)||a.month.localeCompare(b.month))
  };
}
export function modelFingerprint(data){return createHash('sha256').update(JSON.stringify(canonicalModel(data))).digest('hex');}
export function summarizeModel(data){
  const visibleIds=new Set(data.sources.filter(s=>!s.deletedAt).map(s=>s.id));
  return {sources:data.sources.length,entries:data.entries.length,trash:data.sources.filter(s=>s.deletedAt).length,
    totalMinor:data.entries.reduce((sum,e)=>sum+BigInt(e.amount),0n).toString(),
    visibleTotalMinor:data.entries.filter(e=>visibleIds.has(e.sourceId)).reduce((sum,e)=>sum+BigInt(e.amount),0n).toString(),
    fingerprint:modelFingerprint(data)};
}
export function importStatements(backup,accountId,now=Date.now()){
  if(!validAccount(accountId))throw new Error('A stable, explicit destination account ID is required.');
  // A normal INSERT, never REPLACE or DELETE: existing destinations must fail closed.
  const statements=[{sql:'INSERT INTO potok_accounts(id,state,created_at) VALUES (?, ?, ?)',args:[accountId,'pending_owner',now]}];
  for(const s of backup.data.sources)statements.push({sql:'INSERT INTO potok_sources(account_id,id,name,name_key,active,color,sort_order,deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',args:[accountId,s.id,s.name,s.name.trim().toLocaleLowerCase('ru-RU'),Number(s.active),s.color,s.order,s.deletedAt??null]});
  for(const e of backup.data.entries)statements.push({sql:'INSERT INTO potok_entries(account_id,source_id,month,amount_minor) VALUES (?, ?, ?, ?)',args:[accountId,e.sourceId,e.month,e.amount]});
  statements.push({sql:'INSERT INTO potok_imports(id,account_id,checksum,envelope_json,imported_at) VALUES (?, ?, ?, ?, ?)',args:[`legacy-${accountId}`,accountId,backup.checksum,JSON.stringify(backup),now]});
  return statements;
}
export async function readAccount(db,accountId){
  if(!validAccount(accountId))throw new Error('Invalid account ID.');
  const [sources,entries]=await Promise.all([
    db.execute({sql:'SELECT id,name,active,color,sort_order,deleted_at FROM potok_sources WHERE account_id=? ORDER BY id',args:[accountId]}),
    db.execute({sql:'SELECT source_id,month,amount_minor FROM potok_entries WHERE account_id=? ORDER BY source_id,month',args:[accountId]})
  ]);
  return {sources:sources.rows.map(s=>({id:s.id,name:s.name,active:Boolean(s.active),color:s.color,order:s.sort_order,...(s.deleted_at===null?{}:{deletedAt:s.deleted_at})})),entries:entries.rows.map(e=>({sourceId:e.source_id,month:e.month,amount:e.amount_minor}))};
}
export async function importBackup(db,text,accountId){
  const backup=await verifiedBackup(text);
  await db.batch(schemaStatements);
  const existing=await db.execute({sql:'SELECT checksum FROM potok_imports WHERE account_id=?',args:[accountId]});
  if(existing.rows.length){
    if(existing.rows.length!==1||existing.rows[0].checksum!==backup.checksum)throw new Error('Destination already contains a different import. No data changed.');
  }else await db.batch(importStatements(backup,accountId));
  const restored=await readAccount(db,accountId);
  if(modelFingerprint(restored)!==modelFingerprint(backup.data))throw new Error('Imported records differ. Do not switch the application.');
  const envelope=await db.execute({sql:'SELECT envelope_json FROM potok_imports WHERE account_id=?',args:[accountId]});
  if(envelope.rows[0]?.envelope_json!==JSON.stringify(backup))throw new Error('Original backup envelope differs.');
  return {verified:true,...summarizeModel(restored)};
}
