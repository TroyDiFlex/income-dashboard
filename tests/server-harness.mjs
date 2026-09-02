import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash,randomUUID,pbkdf2Sync} from 'node:crypto';
export async function harness(seed={sources:[],entries:[]},password='test-only-password'){
 const props={AUTH_SALT:'test-salt',AUTH_HASH:createHash('sha256').update(pbkdf2Sync(password,'test-salt',600000,32,'sha256').toString('hex')).digest('hex'),SPREADSHEET_ID:'test'};
 const cache=new Map();
 const storage={'Источники':[['ID','Название','Статус','Цвет','Порядок'],...seed.sources.map(s=>[s.id,s.name,s.active?'Активный':'Неактивный',s.color,s.order])],'Доходы':[['Месяц','ID источника','Сумма, ₽'],...seed.entries.map(e=>[e.month,e.sourceId,e.amount/100])]};
 const sheet=name=>({getLastRow:()=>storage[name].length,getMaxRows:()=>100000,getRange:(r,c,h,w)=>({getValues:()=>storage[name].slice(r-1,r-1+h).map(row=>row.slice(c-1,c-1+w)),setValues:rows=>{storage[name].splice(r-1,rows.length,...structuredClone(rows));}})});
 const context=vm.createContext({console,Date,PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key]})},CacheService:{getScriptCache:()=>({get:key=>{const v=cache.get(key);return v&&v.expires>Date.now()?v.value:null;},put:(key,value,seconds)=>cache.set(key,{value,expires:Date.now()+seconds*1000}),remove:key=>cache.delete(key)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,value)=>[...createHash('sha256').update(value).digest()],getUuid:randomUUID,formatDate:d=>d.toISOString().slice(0,7)},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},SpreadsheetApp:{openById:()=>({getSheetByName:sheet}),flush:()=>{}}});
 vm.runInContext(await fs.readFile(new URL('../server/Code.gs',import.meta.url),'utf8'),context);
 return {request:body=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(body)}}).text),props,storage,proof:pbkdf2Sync(password,props.AUTH_SALT,600000,32,'sha256').toString('hex')};
}
