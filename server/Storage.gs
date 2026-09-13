/** Google Sheets persistence, schema validation, and trash retention. */
function sheets_(){var book=SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));var sources=book.getSheetByName('Источники'),entries=book.getSheetByName('Доходы');if(!sources||!entries)fail_('SCHEMA','В таблице отсутствуют вкладки «Источники» или «Доходы».');return {sources:sources,entries:entries};}
function rows_(sheet,columns){var count=sheet.getLastRow()-1;return count>0?sheet.getRange(2,1,count,columns).getValues().filter(function(r){return r.some(function(v){return v!=='';});}):[];}
function readModel_(){
  var sheets=sheets_();
  var trashDates=PropertiesService.getScriptProperties().getProperties();
  var sources=rows_(sheets.sources,5).map(function(r){if(r[2]!=='Активный'&&r[2]!=='Неактивный')fail_('SCHEMA','Статус источника должен быть «Активный» или «Неактивный».');var s={id:String(r[0]),name:String(r[1]),active:r[2]==='Активный',color:String(r[3]),order:Number(r[4])||0};var deletedAt=trashDates['trash:'+s.id];if(deletedAt!==undefined){deletedAt=Number(deletedAt);if(!Number.isSafeInteger(deletedAt)||deletedAt<=0)fail_('SCHEMA','Некорректная дата перемещения в корзину.');s.deletedAt=deletedAt;}return s;});
  var entries=rows_(sheets.entries,3).map(function(r){if(typeof r[2]!=='number'||!isFinite(r[2])||Math.abs(r[2]*100-Math.round(r[2]*100))>0.001)fail_('SCHEMA','Сумма должна быть числом, не более двух знаков после запятой.');var month=r[0] instanceof Date?Utilities.formatDate(r[0],'Asia/Tbilisi','yyyy-MM'):String(r[0]);return {month:month,sourceId:String(r[1]),amount:Math.round(r[2]*100)};});
  validateModel_(sources,entries);
  return {sources:sources,entries:entries};
}
function publicData_(model){
  var sources=model.sources.filter(function(s){return !s.deletedAt;}),ids=new Set(sources.map(function(s){return s.id;}));
  return {sources:sources,entries:model.entries.filter(function(e){return ids.has(e.sourceId);}),trash:model.sources.filter(function(s){return !!s.deletedAt;}).map(function(s){var entries=model.entries.filter(function(e){return e.sourceId===s.id;});return Object.assign({},s,{expiresAt:s.deletedAt+TRASH_RETENTION_MS_,entryCount:entries.length,total:entries.reduce(function(sum,e){return sum+e.amount;},0)});}),revision:hash_(JSON.stringify([model.sources,model.entries]))};
}
function read_(alreadyLocked){
  var lock;if(!alreadyLocked){lock=LockService.getScriptLock();if(!lock.tryLock(15000))fail_('BUSY','Другая запись ещё сохраняется. Попробуйте снова.');}
  try{var model=readModel_();purgeExpired_(model,Date.now());return publicData_(model);}finally{if(lock)lock.releaseLock();}
}
function writeSources_(sources){writeRows_(sheets_().sources,sources.map(function(s){return [s.id,safeText_(s.name),s.active?'Активный':'Неактивный',s.color,s.order];}),5);}
function deleteMatchingRows_(sheet,idColumn,ids){
  var count=sheet.getLastRow()-1;if(count<=0)return;
  var rows=sheet.getRange(2,idColumn,count,1).getValues();
  // Delete bottom-up so retained cells, formulas and formatting are never rewritten.
  for(var i=rows.length-1;i>=0;i--)if(ids.has(String(rows[i][0])))sheet.deleteRow(i+2);
  SpreadsheetApp.flush();
}
function removeSources_(model,ids){
  var sheets=sheets_();
  // Dependents first: an interrupted purge can safely resume without orphaned income rows.
  deleteMatchingRows_(sheets.entries,2,ids);deleteMatchingRows_(sheets.sources,1,ids);
  var properties=PropertiesService.getScriptProperties();ids.forEach(function(id){properties.deleteProperty('trash:'+id);});
  model.entries=model.entries.filter(function(e){return !ids.has(e.sourceId);});model.sources=model.sources.filter(function(s){return !ids.has(s.id);});
}
function purgeExpired_(model,now){var ids=new Set(model.sources.filter(function(s){return s.deletedAt&&s.deletedAt+TRASH_RETENTION_MS_<=now;}).map(function(s){return s.id;}));if(ids.size)removeSources_(model,ids);return ids.size;}
function ensureTrashTrigger_(){
  if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='purgeExpiredSources'&&t.getEventType()===ScriptApp.EventType.CLOCK;}))ScriptApp.newTrigger('purgeExpiredSources').timeBased().everyHours(1).create();
}
// Runs on Google's servers even when the website is closed. Reads also enforce the exact deadline.
function purgeExpiredSources(){
  var lock=LockService.getScriptLock();if(!lock.tryLock(15000))return;
  try{var count=purgeExpired_(readModel_(),Date.now());PropertiesService.getScriptProperties().setProperty('TRASH_LAST_RUN_AT',String(Date.now()));return {deleted:count};}finally{lock.releaseLock();}
}
function validMonth_(value){return typeof value==='string'&&/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value);}
function validSource_(s){return s&&typeof s.id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(s.id)&&typeof s.name==='string'&&s.name.trim().length>0&&s.name.length<=80&&typeof s.active==='boolean'&&typeof s.color==='string'&&/^#[0-9a-f]{6}$/i.test(s.color)&&Number.isInteger(s.order)&&s.order>=0&&s.order<=10000;}
function validAmount_(amount){return Number.isSafeInteger(amount)&&amount>=0&&amount<=999999999999;}
function validateModel_(sources,entries){
  var ids={},names={};sources.forEach(function(s){var name=typeof s.name==='string'?s.name.trim().toLowerCase():'';if(!validSource_(s)||ids[s.id]||names[name])fail_('SCHEMA','Некорректный или повторный источник в Google Таблице.');ids[s.id]=true;names[name]=true;});
  var keys={};entries.forEach(function(e){var key=e.sourceId+'|'+e.month;if(!ids[e.sourceId]||!validMonth_(e.month)||!validAmount_(e.amount)||keys[key])fail_('SCHEMA','Проверьте месяцы, суммы и повторные записи в Google Таблице.');keys[key]=true;});
}
function safeText_(text){return /^[=+@-]/.test(text)?"'"+text:text;}
function writeRows_(sheet,rows,columns){
  var needed=Math.max(rows.length,sheet.getLastRow()-1);if(!needed)return;
  var matrix=rows.slice();while(matrix.length<needed)matrix.push(new Array(columns).fill(''));
  if(sheet.getMaxRows()<needed+1)sheet.insertRowsAfter(sheet.getMaxRows(),needed+1-sheet.getMaxRows());
  sheet.getRange(2,1,needed,columns).setValues(matrix);
  SpreadsheetApp.flush();
}
