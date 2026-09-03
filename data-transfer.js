import {monthRange,parseAmount,sortSources,validateData,validMonth} from './model.js';

export const BACKUP_SCHEMA='potok-income-backup';
export const BACKUP_VERSION=1;
export const CSV_DELETE_MARKER='—';
const CSV_FIXED_HEADERS=['ID','Источник','Статус','Цвет','Порядок'];

const quote=value=>`"${String(value).replace(/"/g,'""')}"`;
const entryKey=(sourceId,month)=>`${sourceId}|${month}`;

export function backupFilename(createdAt=Date.now()) {
  const stamp=new Date(createdAt).toISOString().replace(/[:.]/g,'-');
  return `potok-backup-${stamp}.json`;
}

export function csvFilename(createdAt=Date.now()) {
  return `potok-income-${new Date(createdAt).toISOString().slice(0,10)}.csv`;
}

export function exportWideCsv(data) {
  validateData(data);
  const present=[...new Set(data.entries.map(entry=>entry.month))].sort();
  const months=present.length?monthRange(present[0],present.at(-1)):[];
  const amounts=new Map(data.entries.map(entry=>[entryKey(entry.sourceId,entry.month),entry.amount]));
  const rows=[[...CSV_FIXED_HEADERS,...months]];
  for(const source of sortSources(data.sources)){
    rows.push([
      source.id,
      source.name,
      source.active?'Активный':'Неактивный',
      source.color,
      source.order,
      ...months.map(month=>{
        const amount=amounts.get(entryKey(source.id,month));
        return amount===undefined?'':String(amount/100).replace('.',',');
      })
    ]);
  }
  return '\ufeff'+rows.map(row=>row.map(quote).join(';')).join('\r\n');
}

export function parseCsv(text) {
  text=String(text).replace(/^\ufeff/,'');
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){
      if(char==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(char==='"')quoted=false;
      else cell+=char;
    }else if(char==='"'&&cell==='')quoted=true;
    else if(char===';'){row.push(cell);cell='';}
    else if(char==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=char;
  }
  if(quoted)throw new Error('В CSV не закрыта кавычка.');
  if(cell!==''||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  return rows.filter(values=>values.some(value=>value.trim()!==''));
}

function validateCsvHeaders(headers) {
  if(headers.length<CSV_FIXED_HEADERS.length)throw new Error('В CSV отсутствуют обязательные столбцы.');
  CSV_FIXED_HEADERS.forEach((expected,index)=>{if(headers[index]?.trim()!==expected)throw new Error(`Ожидался столбец «${expected}».`);});
  const months=headers.slice(CSV_FIXED_HEADERS.length).map(value=>value.trim());
  if(months.some(month=>!validMonth(month))||new Set(months).size!==months.length)throw new Error('Столбцы месяцев должны иметь уникальный формат ГГГГ-ММ.');
  return months;
}

function parseSourceRow(row,index,idFactory) {
  const rawId=(row[0]||'').trim(),name=(row[1]||'').trim(),status=(row[2]||'').trim(),color=(row[3]||'').trim().toLowerCase(),rawOrder=(row[4]||'').trim();
  if(!name)throw new Error(`Строка ${index}: не указано название источника.`);
  if(status!=='Активный'&&status!=='Неактивный')throw new Error(`Строка ${index}: статус должен быть «Активный» или «Неактивный».`);
  if(!/^#[0-9a-f]{6}$/.test(color))throw new Error(`Строка ${index}: неверный цвет.`);
  const order=Number(rawOrder);
  if(!Number.isInteger(order)||order<0||order>10000)throw new Error(`Строка ${index}: неверный порядок.`);
  const id=rawId||idFactory();
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id))throw new Error(`Строка ${index}: неверный ID источника.`);
  return {id,name,active:status==='Активный',color,order};
}

export function diffData(before,after) {
  const sourceBefore=new Map(before.sources.map(source=>[source.id,JSON.stringify(source)]));
  const sourceAfter=new Map(after.sources.map(source=>[source.id,JSON.stringify(source)]));
  const entriesBefore=new Map(before.entries.map(entry=>[entryKey(entry.sourceId,entry.month),entry.amount]));
  const entriesAfter=new Map(after.entries.map(entry=>[entryKey(entry.sourceId,entry.month),entry.amount]));
  const count=(left,right)=>[...right].filter(([key,value])=>!left.has(key)||left.get(key)!==value).length;
  return {
    sourcesAdded:[...sourceAfter.keys()].filter(key=>!sourceBefore.has(key)).length,
    sourcesChanged:count(sourceBefore,sourceAfter)-[...sourceAfter.keys()].filter(key=>!sourceBefore.has(key)).length,
    entriesAdded:[...entriesAfter.keys()].filter(key=>!entriesBefore.has(key)).length,
    entriesChanged:[...entriesAfter].filter(([key,value])=>entriesBefore.has(key)&&entriesBefore.get(key)!==value).length,
    entriesDeleted:[...entriesBefore.keys()].filter(key=>!entriesAfter.has(key)).length
  };
}

export function planWideCsvImport(current,text,{mode='merge',idFactory=()=>crypto.randomUUID()}={}) {
  if(mode!=='merge'&&mode!=='replace-period')throw new Error('Неизвестный режим импорта.');
  const rows=parseCsv(text);if(!rows.length)throw new Error('CSV пуст.');
  const months=validateCsvHeaders(rows[0]);if(!months.length)throw new Error('В CSV нет столбцов месяцев.');
  const imported=[],ids=new Set(),names=new Set();
  for(let index=1;index<rows.length;index++){
    const row=rows[index];if(row.every(value=>value.trim()===''))continue;
    const source=parseSourceRow(row,index+1,idFactory),nameKey=source.name.toLocaleLowerCase('ru-RU');
    if(ids.has(source.id))throw new Error(`Строка ${index+1}: повторяется ID источника.`);
    if(names.has(nameKey))throw new Error(`Строка ${index+1}: повторяется название источника.`);
    ids.add(source.id);names.add(nameKey);imported.push({source,row});
  }
  if(!imported.length)throw new Error('В CSV нет источников.');
  const sources=new Map(current.sources.map(source=>[source.id,{...source}]));
  for(const {source} of imported)sources.set(source.id,source);
  const allNames=new Set();
  for(const source of sources.values()){
    const key=source.name.toLocaleLowerCase('ru-RU');if(allNames.has(key))throw new Error(`Название «${source.name}» уже используется другим источником.`);allNames.add(key);
  }
  const entries=new Map(current.entries.map(entry=>[entryKey(entry.sourceId,entry.month),{...entry}]));
  for(const {source,row} of imported)months.forEach((month,monthIndex)=>{
    const raw=(row[CSV_FIXED_HEADERS.length+monthIndex]||'').trim(),key=entryKey(source.id,month);
    if(!raw){if(mode==='replace-period')entries.delete(key);return;}
    if(raw===CSV_DELETE_MARKER){entries.delete(key);return;}
    let amount;try{amount=parseAmount(raw);}catch(error){throw new Error(`Источник «${source.name}», ${month}: ${error.message}`);}
    entries.set(key,{sourceId:source.id,month,amount});
  });
  const result={...current,sources:[...sources.values()],entries:[...entries.values()].sort((a,b)=>a.month.localeCompare(b.month)||a.sourceId.localeCompare(b.sourceId))};
  validateData(result);
  return {mode,months,data:result,changes:diffData(current,result)};
}

export function parseBackup(text) {
  let backup;try{backup=JSON.parse(String(text));}catch{throw new Error('Файл не является корректным JSON.');}
  if(backup?.schema!==BACKUP_SCHEMA||backup?.version!==BACKUP_VERSION)throw new Error('Это не поддерживаемая резервная копия «Потока».');
  if(!Number.isSafeInteger(backup.createdAt)||backup.createdAt<=0||typeof backup.checksum!=='string'||!/^[0-9a-f]{64}$/.test(backup.checksum))throw new Error('В резервной копии повреждены метаданные.');
  if(!backup.data||!Array.isArray(backup.data.sources)||!Array.isArray(backup.data.entries))throw new Error('В резервной копии отсутствуют данные.');
  const visible=backup.data.sources.filter(source=>!source.deletedAt),visibleIds=new Set(visible.map(source=>source.id));
  const publicShape={sources:visible,entries:backup.data.entries.filter(entry=>visibleIds.has(entry.sourceId))};
  validateData(publicShape);
  return backup;
}
