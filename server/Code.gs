/**
 * Potok API. Deploy as a web app executing as the owner.
 * Public source contains NO credentials or income records.
 * Script properties: SPREADSHEET_ID, AUTH_SALT, AUTH_HASH, BACKUP_FOLDER_ID.
 * AUTH_HASH = SHA-256(hex(PBKDF2-SHA256(password, UTF8(AUTH_SALT), 600000, 32))).
 * Every data operation requires an expiring random bearer session.
 */
var SESSION_DURATION_MS_=30*24*60*60*1000;
var TRASH_RETENTION_MS_=30*24*60*60*1000;
var BACKUP_RETENTION_MS_=90*24*60*60*1000;
var BACKUP_SCHEMA_='potok-income-backup';
var BACKUP_VERSION_=1;
var MAX_REQUEST_CHARS_=3000000;
function doGet() { return json_({ok:true,result:{service:'potok',version:4}}); }
function doPost(e) {
  try {
    if(!e || !e.postData || e.postData.contents.length>MAX_REQUEST_CHARS_) fail_('BAD_REQUEST','Некорректный запрос.');
    var body; try{body=JSON.parse(e.postData.contents);}catch(error){fail_('BAD_REQUEST','Некорректный запрос.');}
    return json_({ok:true,result:dispatch_(body)});
  } catch(error) {
    // Never log request bodies, authentication proofs, sessions, or financial data.
    return json_({ok:false,code:error.apiCode||'SERVER',message:error.apiCode?error.message:'Ошибка Google. Данные не подтверждены как сохранённые. Нажмите «Обновить» перед повторной попыткой.'});
  }
}
function dispatch_(body) {
  if(!body || typeof body.action!=='string')fail_('BAD_REQUEST','Некорректное действие.');
  var properties=PropertiesService.getScriptProperties();
  if(!properties.getProperty('AUTH_HASH')||!properties.getProperty('AUTH_SALT')||!properties.getProperty('SPREADSHEET_ID'))fail_('SETUP','Подключение сервера ещё не завершено.');
  if(body.action==='bootstrap')return {salt:properties.getProperty('AUTH_SALT'),iterations:600000};
  if(body.action==='login')return login_(body.proof);
  requireSession_(body.token);
  if(body.action==='logout'){properties.deleteProperty(sessionKey_(body.token));CacheService.getScriptCache().remove(sessionKey_(body.token));return {loggedOut:true};}
  if(body.action==='read')return read_();
  if(body.action==='backup')return backupEnvelope_(readModel_(),'download');
  if(body.action==='createBackup')return createDriveBackup_('manual');
  if(body.action==='mutate')return mutate_(body);
  if(body.action==='trashMaintenance'){
    var authorization=ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    if(authorization.getAuthorizationStatus()===ScriptApp.AuthorizationStatus.REQUIRED)return {scheduled:false,authorizationUrl:authorization.getAuthorizationUrl()};
    ensureTrashTrigger_();purgeExpiredSources();return {scheduled:true,lastRunAt:PropertiesService.getScriptProperties().getProperty('TRASH_LAST_RUN_AT')};
  }
  if(body.action==='backupMaintenance'){
    var backupAuthorization=ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    if(backupAuthorization.getAuthorizationStatus()===ScriptApp.AuthorizationStatus.REQUIRED)return {scheduled:false,authorizationUrl:backupAuthorization.getAuthorizationUrl()};
    ensureBackupTrigger_();var saved=createDriveBackup_('scheduled');purgeOldBackups_();return {scheduled:true,backup:saved};
  }
  fail_('BAD_REQUEST','Неизвестное действие.');
}
function json_(body){return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);}
function fail_(code,message){var error=new Error(message);error.apiCode=code;throw error;}
function hash_(text){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function equals_(a,b){if(typeof a!=='string'||typeof b!=='string')return false;var diff=a.length^b.length;for(var i=0;i<64;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function sessionKey_(token){return 'session:'+hash_(token+PropertiesService.getScriptProperties().getProperty('AUTH_HASH'));}
function login_(proof){
  var lock=LockService.getScriptLock();if(!lock.tryLock(5000))fail_('BUSY','Сервис занят. Повторите через несколько секунд.');
  try{
    var cache=CacheService.getScriptCache();
    if(cache.get('login-blocked'))fail_('RATE_LIMIT','Слишком много попыток входа. Подождите одну минуту.');
    var expected=PropertiesService.getScriptProperties().getProperty('AUTH_HASH');
    if(typeof proof!=='string'||! /^[0-9a-f]{64}$/.test(proof)||!equals_(hash_(proof),expected)){
      var failures=Number(cache.get('login-failures')||0)+1;
      cache.put('login-failures',String(failures),60);if(failures>=8)cache.put('login-blocked','1',60);
      fail_('AUTH','Неверный пароль.');
    }
    cache.remove('login-failures');
    var data=read_(true),properties=PropertiesService.getScriptProperties(),now=Date.now();
    // Session validity must not depend on an evictable six-hour cache.
    var saved=properties.getProperties();
    Object.keys(saved).forEach(function(key){if(key.indexOf('session:')===0&&!(Number(saved[key])>now))properties.deleteProperty(key);});
    var token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
    var expiresAt=now+SESSION_DURATION_MS_;
    properties.setProperty(sessionKey_(token),String(expiresAt));
    return {token:token,expiresAt:expiresAt,data:data};
  } finally{lock.releaseLock();}
}
function requireSession_(token){
  if(typeof token!=='string'||! /^[0-9a-f]{64}$/.test(token))fail_('SESSION','Сессия закончилась. Войдите снова.');
  var key=sessionKey_(token),properties=PropertiesService.getScriptProperties(),expiresAt=properties.getProperty(key);
  if(expiresAt!==null){
    if(Number(expiresAt)>Date.now())return;
    properties.deleteProperty(key);
  }else if(CacheService.getScriptCache().get(key))return; // Honor sessions issued before this update until they expire.
  fail_('SESSION','Сессия закончилась. Войдите снова.');
}
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
function backupEnvelope_(model,reason){
  var createdAt=Date.now(),sources=model.sources.map(function(source){return Object.assign({},source);}),entries=model.entries.map(function(entry){return Object.assign({},entry);});
  return {schema:BACKUP_SCHEMA_,version:BACKUP_VERSION_,createdAt:createdAt,reason:reason,checksum:hash_(JSON.stringify([sources,entries])),data:{sources:sources,entries:entries}};
}
function backupFolder_(){
  var id=PropertiesService.getScriptProperties().getProperty('BACKUP_FOLDER_ID');
  if(!id)fail_('BACKUP_SETUP','Для безопасной операции сначала настройте папку резервных копий.');
  try{return DriveApp.getFolderById(id);}catch(error){fail_('BACKUP_SETUP','Папка резервных копий недоступна. Проверьте BACKUP_FOLDER_ID и разрешения.');}
}
function backupName_(createdAt){return 'potok-backup-'+new Date(createdAt).toISOString().replace(/[:.]/g,'-')+'.json';}
function createDriveBackup_(reason,model){
  var envelope=backupEnvelope_(model||readModel_(),reason),name=backupName_(envelope.createdAt),file;
  try{file=backupFolder_().createFile(name,JSON.stringify(envelope),MimeType.PLAIN_TEXT);file.setDescription('Автоматическая резервная копия «Потока». Причина: '+reason+'.');}
  catch(error){if(error.apiCode)throw error;fail_('BACKUP','Не удалось создать резервную копию. Изменения не применены.');}
  return {fileId:file.getId(),name:name,createdAt:envelope.createdAt,reason:reason};
}
function purgeOldBackups_(){
  var files=backupFolder_().getFiles(),deadline=Date.now()-BACKUP_RETENTION_MS_,deleted=0;
  while(files.hasNext()){
    var file=files.next();
    if(file.getName().indexOf('potok-backup-')===0&&file.getDateCreated().getTime()<deadline){file.setTrashed(true);deleted++;}
  }
  return deleted;
}
function ensureBackupTrigger_(){
  if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='createScheduledBackup'&&t.getEventType()===ScriptApp.EventType.CLOCK;}))ScriptApp.newTrigger('createScheduledBackup').timeBased().everyDays(1).atHour(4).create();
}
function createScheduledBackup(){
  var lock=LockService.getScriptLock();if(!lock.tryLock(15000))return;
  try{var backup=createDriveBackup_('scheduled');purgeOldBackups_();return backup;}finally{lock.releaseLock();}
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
  var ids={};sources.forEach(function(s){if(!validSource_(s)||ids[s.id])fail_('SCHEMA','Некорректный или повторный источник в Google Таблице.');ids[s.id]=true;});
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
function writeModel_(next,current){
  var nextTrash=new Map(next.sources.filter(function(source){return source.deletedAt;}).map(function(source){return [source.id,source.deletedAt];}));
  var currentTrash=new Map(current.sources.filter(function(source){return source.deletedAt;}).map(function(source){return [source.id,source.deletedAt];}));
  try{
    writeRows_(sheets_().sources,next.sources.map(function(s){return [s.id,safeText_(s.name),s.active?'Активный':'Неактивный',s.color,s.order];}),5);
    writeRows_(sheets_().entries,next.entries.map(function(e){return [e.month,e.sourceId,e.amount/100];}),3);
    var properties=PropertiesService.getScriptProperties(),all=properties.getProperties();
    Object.keys(all).forEach(function(key){if(key.indexOf('trash:')===0&&!nextTrash.has(key.slice(6)))properties.deleteProperty(key);});
    nextTrash.forEach(function(deletedAt,id){properties.setProperty('trash:'+id,String(deletedAt));});
  }catch(error){
    var restored=true;
    try{
      writeRows_(sheets_().sources,current.sources.map(function(s){return [s.id,safeText_(s.name),s.active?'Активный':'Неактивный',s.color,s.order];}),5);
      writeRows_(sheets_().entries,current.entries.map(function(e){return [e.month,e.sourceId,e.amount/100];}),3);
      var rollback=PropertiesService.getScriptProperties(),saved=rollback.getProperties();
      Object.keys(saved).forEach(function(key){if(key.indexOf('trash:')===0&&!currentTrash.has(key.slice(6)))rollback.deleteProperty(key);});
      currentTrash.forEach(function(deletedAt,id){rollback.setProperty('trash:'+id,String(deletedAt));});
    }catch(rollbackError){restored=false;}
    fail_('WRITE',restored?'Не удалось применить импорт. Исходные данные восстановлены; проверьте резервную копию перед повтором.':'Не удалось применить импорт и автоматически восстановить таблицу. Используйте созданную резервную копию.');
  }
}
function validateImportedModel_(sources,entries){
  if(sources.length>200||entries.length>20000)fail_('VALIDATION','Импорт превышает допустимый размер данных.');
  var names={};
  sources.forEach(function(source){
    var key=source.name.trim().toLowerCase();if(names[key])fail_('VALIDATION','В импорте повторяется название источника.');names[key]=true;
    if(source.deletedAt!==undefined&&(!Number.isSafeInteger(source.deletedAt)||source.deletedAt<=0))fail_('VALIDATION','В резервной копии повреждена дата корзины.');
  });
  validateModel_(sources,entries);
}
function importedModel_(operation,current){
  if(operation.type==='restoreBackup'){
    var backup=operation.backup;
    if(!backup||backup.schema!==BACKUP_SCHEMA_||backup.version!==BACKUP_VERSION_||!Number.isSafeInteger(backup.createdAt)||!backup.data||!Array.isArray(backup.data.sources)||!Array.isArray(backup.data.entries))fail_('VALIDATION','Некорректная резервная копия.');
    var rawSources=backup.data.sources.map(function(source){return Object.assign({},source);}),entries=backup.data.entries.map(function(entry){return Object.assign({},entry);});
    if(backup.checksum!==hash_(JSON.stringify([rawSources,entries])))fail_('VALIDATION','Контрольная сумма резервной копии не совпадает.');
    var sources=rawSources.map(function(source){var copy=Object.assign({},source);if(copy.deletedAt)copy.deletedAt=Date.now();return copy;});
    validateImportedModel_(sources,entries);return {sources:sources,entries:entries};
  }
  var incoming=operation.data;
  if(!incoming||!Array.isArray(incoming.sources)||!Array.isArray(incoming.entries))fail_('VALIDATION','Некорректный план импорта.');
  var trashed=current.sources.filter(function(source){return source.deletedAt;}),trashIds=new Set(trashed.map(function(source){return source.id;}));
  var visible=current.sources.filter(function(source){return !source.deletedAt;}),incomingIds=new Set(incoming.sources.map(function(source){return source.id;}));
  if(visible.some(function(source){return !incomingIds.has(source.id);})||incoming.sources.some(function(source){return trashIds.has(source.id)||source.deletedAt;}))fail_('VALIDATION','CSV-импорт не может удалять источники или изменять корзину.');
  var next={sources:incoming.sources.map(function(source){return Object.assign({},source);}).concat(trashed),entries:incoming.entries.map(function(entry){return Object.assign({},entry);}).concat(current.entries.filter(function(entry){return trashIds.has(entry.sourceId);}))};
  validateImportedModel_(next.sources,next.entries);return next;
}
function mutate_(body){
  var lock=LockService.getScriptLock();if(!lock.tryLock(15000))fail_('BUSY','Другая запись ещё сохраняется. Попробуйте снова.');
  try{
    requireSession_(body.token);
    var current=readModel_();purgeExpired_(current,Date.now());if(typeof body.revision!=='string'||body.revision!==publicData_(current).revision)fail_('CONFLICT','Данные изменились. Обновите страницу перед сохранением.');
    var op=body.operation;if(!op||typeof op.type!=='string')fail_('BAD_REQUEST','Неверное изменение.');
    if(op.type==='setSource'){
      var source=op.source;if(!validSource_(source))fail_('VALIDATION','Проверьте название и цвет источника.');
      source={id:source.id,name:source.name.trim(),active:source.active,color:source.color,order:source.order};
      if(current.sources.some(function(s){return s.id===source.id&&s.deletedAt;}))fail_('VALIDATION','Источник находится в корзине. Сначала восстановите его.');
      if(current.sources.some(function(s){return s.id!==source.id&&s.name.toLowerCase()===source.name.toLowerCase();}))fail_('VALIDATION','Источник с таким названием уже существует, в том числе в корзине.');
      var index=current.sources.findIndex(function(s){return s.id===source.id;});
      if(index<0){if(current.sources.length>=200)fail_('VALIDATION','Достигнут предел: 200 источников.');current.sources.push(source);}else current.sources[index]=source;
      validateModel_(current.sources,current.entries);
      writeSources_(current.sources);
    }else if(op.type==='setEntries'){
      if(!Array.isArray(op.entries)||!op.entries.length||op.entries.length>200)fail_('VALIDATION','Некорректный список сумм.');
      var seen={};op.entries.forEach(function(e){if(!e||!current.sources.some(function(s){return s.id===e.sourceId&&!s.deletedAt;})||!validMonth_(e.month)||!(e.amount===null||validAmount_(e.amount)))fail_('VALIDATION','Проверьте месяц, источник и сумму.');var key=e.sourceId+'|'+e.month;if(seen[key])fail_('VALIDATION','Повторная запись.');seen[key]=true;});
      op.entries.forEach(function(e){current.entries=current.entries.filter(function(old){return !(old.sourceId===e.sourceId&&old.month===e.month);});if(e.amount!==null)current.entries.push({sourceId:e.sourceId,month:e.month,amount:e.amount});});
      current.entries.sort(function(a,b){return a.month.localeCompare(b.month)||a.sourceId.localeCompare(b.sourceId);});
      if(current.entries.length>20000)fail_('VALIDATION','Достигнут предел: 20 000 записей.');
      validateModel_(current.sources,current.entries);
      writeRows_(sheets_().entries,current.entries.map(function(e){return [e.month,e.sourceId,e.amount/100];}),3);
    }else if(op.type==='importData'||op.type==='restoreBackup'){
      var next=importedModel_(op,current);createDriveBackup_('before-'+op.type,current);writeModel_(next,current);
    }else if(['trashSource','restoreSource','deleteSource'].indexOf(op.type)>=0){
      var target=current.sources.find(function(s){return s.id===op.sourceId;});if(!target)fail_('VALIDATION','Источник не найден. Обновите данные.');
      if(op.type==='trashSource'){
        if(target.deletedAt)fail_('VALIDATION','Источник уже в корзине.');
        ensureTrashTrigger_();PropertiesService.getScriptProperties().setProperty('trash:'+target.id,String(Date.now()));
      }else{
        if(!target.deletedAt)fail_('VALIDATION','Сначала переместите источник в корзину.');
        if(op.type==='restoreSource'){PropertiesService.getScriptProperties().deleteProperty('trash:'+target.id);}
        else{createDriveBackup_('before-delete-source',current);removeSources_(current,new Set([target.id]));}
      }
    }else fail_('BAD_REQUEST','Неизвестный тип изменения.');
    return publicData_(readModel_());
  }finally{lock.releaseLock();}
}
