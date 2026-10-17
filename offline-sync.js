import {validateData} from './model.js';

const fields=['name','active','color','order'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const entry=(data,id,month)=>data.entries.find(e=>e.sourceId===id&&e.month===month)?.amount??null;
const profile=id=>{if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{16,64}$/.test(id))throw new Error('Не определён профиль владельца данных.');};

export function createOfflineChange(accountId,before,operation,id=crypto.randomUUID()){
  profile(accountId);validateData(before);
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{16,64}$/.test(id))throw new Error('Некорректный номер изменения.');
  let edits;
  if(operation.type==='setEntries'){
    if(!Array.isArray(operation.entries)||!operation.entries.length||operation.entries.length>200)throw new Error('Некорректный список сумм.');
    const seen=new Set();
    edits=operation.entries.map(e=>{
      const key=e.sourceId+'|'+e.month;
      if(seen.has(key))throw new Error('Повторная запись.');seen.add(key);
      if(!before.sources.some(s=>s.id===e.sourceId))throw new Error('Источник недоступен.');
      if(e.amount!==null&&(!Number.isSafeInteger(e.amount)||e.amount<0||e.amount>999999999999))throw new Error('Некорректная сумма.');
      const candidate={...before,entries:before.entries.filter(old=>old.sourceId!==e.sourceId||old.month!==e.month)};
      // Validation must also cover the month when the edit deletes an entry.
      validateData({...candidate,entries:[...candidate.entries,{sourceId:e.sourceId,month:e.month,amount:e.amount??0}]});
      return {sourceId:e.sourceId,month:e.month,before:entry(before,e.sourceId,e.month),after:e.amount};
    });
  }else if(operation.type==='setSource'){
    const source=operation.source,current=before.sources.find(s=>s.id===source?.id)||null;
    validateData({...before,sources:[...before.sources.filter(s=>s.id!==source?.id),source]});
    edits={id:source.id,before:current,after:Object.fromEntries(['id',...fields].map(key=>[key,source[key]]))};
  }else throw new Error('Это действие требует подключения к серверу.');
  return {version:1,id,accountId,type:operation.type,edits};
}

export function reconcileChange(change,latest,preference=null){
  profile(change.accountId);validateData(latest);
  if(change.version!==1||!['setEntries','setSource'].includes(change.type))throw new Error('Неподдерживаемый формат изменения.');
  if(preference!==null&&preference!=='local'&&preference!=='server')throw new Error('Неизвестный выбор приоритета.');
  const conflicts=[];
  const choose=(key,before,local,server)=>{
    if(same(local,server)||same(local,before))return server;
    if(same(before,server))return local;
    conflicts.push({key,before,local,server});
    return preference==='local'?local:server;
  };
  if(change.type==='setEntries'){
    const entries=[];
    for(const e of change.edits){
      if(!latest.sources.some(s=>s.id===e.sourceId)){
        conflicts.push({key:e.sourceId+'|'+e.month,type:'source-unavailable',before:e.before,local:e.after,server:null});
        // Choosing a local value cannot silently resurrect a deleted source.
        if(preference!=='server')return {operation:null,conflicts,resolved:false};
        continue;
      }
      const current=entry(latest,e.sourceId,e.month),amount=choose(e.sourceId+'|'+e.month,e.before,e.after,current);
      if(amount!==current)entries.push({sourceId:e.sourceId,month:e.month,amount});
    }
    const operation=entries.length?{type:'setEntries',entries}:null;
    if(operation){
      const changed=new Set(entries.map(e=>e.sourceId+'|'+e.month));
      validateData({...latest,entries:[...latest.entries.filter(e=>!changed.has(e.sourceId+'|'+e.month)),...entries.filter(e=>e.amount!==null)]});
    }
    return {operation,conflicts,resolved:!conflicts.length||preference!==null};
  }
  const e=change.edits,current=latest.sources.find(s=>s.id===e.id)||null;
  if(e.before&&!current||latest.trash?.some(s=>s.id===e.id))return {operation:null,conflicts:[{key:e.id,type:'source-unavailable'}],resolved:preference==='server'};
  const next={...(current||e.after)};
  for(const field of fields)next[field]=choose(e.id+'|'+field,e.before?.[field]??null,e.after[field],current?.[field]??null);
  if(!current)next.id=e.id;
  try{validateData({...latest,sources:[...latest.sources.filter(s=>s.id!==e.id),next]});}
  catch{return {operation:null,conflicts:[...conflicts,{key:e.id,type:'source-collision'}],resolved:preference==='server'};}
  return {operation:same(current,next)?null:{type:'setSource',source:next},conflicts,resolved:!conflicts.length||preference!==null};
}

export async function syncPending({accountId,store,api,resolution=null,isCurrent=()=>true}){
  profile(accountId);
  const pending=await store.listChanges(accountId);
  if(!pending.length)return {status:'synced',sent:0};
  // Revalidation precedes every sync run. Each server mutation must revalidate too.
  try{
    const session=await api.checkSession();
    if(session.accountId!==accountId)return {status:'wrong-profile',sent:0};
    let sent=0;
    for(const change of pending){
      if(!isCurrent())return {status:'stopped',sent};
      if(change.accountId!==accountId)throw new Error('Локальные данные принадлежат другому профилю.');
      const latest=await api.read(accountId);
      if(!isCurrent())return {status:'stopped',sent};
      const preference=resolution?.changeId===change.id&&resolution.serverRevision===latest.revision?resolution.preference:null;
      const planned=reconcileChange(change,latest,preference);
      if(!planned.resolved)return {status:'conflict',sent,changeId:change.id,serverRevision:latest.revision,conflicts:planned.conflicts};
      if(planned.operation)await api.mutate(latest.revision,planned.operation,change.id,accountId);
      // No removal on network failure or revocation, even if the write reached the server.
      await store.complete(change.id,accountId);sent++;
    }
    return {status:'synced',sent};
  }catch(error){
    if(error.code==='SESSION')return {status:'reauthenticate'};
    if(error.code==='CONFLICT')return {status:'retry'};
    if(error.code==='NETWORK')return {status:'offline'};
    throw error;
  }
}
