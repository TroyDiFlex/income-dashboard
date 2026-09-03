/**
 * Potok API. Deploy as a web app executing as the owner.
 * Public source contains NO credentials or income records.
 * Script properties: SPREADSHEET_ID, AUTH_SALT, AUTH_HASH.
 * AUTH_HASH = SHA-256(hex(PBKDF2-SHA256(password, UTF8(AUTH_SALT), 600000, 32))).
 * Every data operation requires an expiring random bearer session.
 */
var SESSION_DURATION_MS_=30*24*60*60*1000;
function doGet() { return json_({ok:true,result:{service:'potok',version:2}}); }
function doPost(e) {
  try {
    if(!e || !e.postData || e.postData.contents.length>200000) fail_('BAD_REQUEST','Некорректный запрос.');
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
  if(body.action==='mutate')return mutate_(body);
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
    var data=read_(),properties=PropertiesService.getScriptProperties(),now=Date.now();
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
function read_(){
  var sheets=sheets_();
  var sources=rows_(sheets.sources,5).map(function(r){if(r[2]!=='Активный'&&r[2]!=='Неактивный')fail_('SCHEMA','Статус источника должен быть «Активный» или «Неактивный».');return {id:String(r[0]),name:String(r[1]),active:r[2]==='Активный',color:String(r[3]),order:Number(r[4])||0};});
  var entries=rows_(sheets.entries,3).map(function(r){if(typeof r[2]!=='number'||!isFinite(r[2])||Math.abs(r[2]*100-Math.round(r[2]*100))>0.001)fail_('SCHEMA','Сумма должна быть числом, не более двух знаков после запятой.');var month=r[0] instanceof Date?Utilities.formatDate(r[0],'Asia/Tbilisi','yyyy-MM'):String(r[0]);return {month:month,sourceId:String(r[1]),amount:Math.round(r[2]*100)};});
  validateModel_(sources,entries);
  return {sources:sources,entries:entries,revision:hash_(JSON.stringify([sources,entries]))};
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
function mutate_(body){
  var lock=LockService.getScriptLock();if(!lock.tryLock(15000))fail_('BUSY','Другая запись ещё сохраняется. Попробуйте снова.');
  try{
    requireSession_(body.token);
    var current=read_();if(typeof body.revision!=='string'||body.revision!==current.revision)fail_('CONFLICT','Данные изменились. Обновите страницу перед сохранением.');
    var op=body.operation;if(!op||typeof op.type!=='string')fail_('BAD_REQUEST','Неверное изменение.');
    if(op.type==='setSource'){
      var source=op.source;if(!validSource_(source))fail_('VALIDATION','Проверьте название и цвет источника.');
      source={id:source.id,name:source.name.trim(),active:source.active,color:source.color,order:source.order};
      if(current.sources.some(function(s){return s.id!==source.id&&s.name.toLowerCase()===source.name.toLowerCase();}))fail_('VALIDATION','Источник с таким названием уже существует.');
      var index=current.sources.findIndex(function(s){return s.id===source.id;});
      if(index<0){if(current.sources.length>=200)fail_('VALIDATION','Достигнут предел: 200 источников.');current.sources.push(source);}else current.sources[index]=source;
      validateModel_(current.sources,current.entries);
      writeRows_(sheets_().sources,current.sources.map(function(s){return [s.id,safeText_(s.name),s.active?'Активный':'Неактивный',s.color,s.order];}),5);
    }else if(op.type==='setEntries'){
      if(!Array.isArray(op.entries)||!op.entries.length||op.entries.length>200)fail_('VALIDATION','Некорректный список сумм.');
      var seen={};op.entries.forEach(function(e){if(!e||!current.sources.some(function(s){return s.id===e.sourceId;})||!validMonth_(e.month)||!(e.amount===null||validAmount_(e.amount)))fail_('VALIDATION','Проверьте месяц, источник и сумму.');var key=e.sourceId+'|'+e.month;if(seen[key])fail_('VALIDATION','Повторная запись.');seen[key]=true;});
      op.entries.forEach(function(e){current.entries=current.entries.filter(function(old){return !(old.sourceId===e.sourceId&&old.month===e.month);});if(e.amount!==null)current.entries.push({sourceId:e.sourceId,month:e.month,amount:e.amount});});
      current.entries.sort(function(a,b){return a.month.localeCompare(b.month)||a.sourceId.localeCompare(b.sourceId);});
      if(current.entries.length>20000)fail_('VALIDATION','Достигнут предел: 20 000 записей.');
      validateModel_(current.sources,current.entries);
      writeRows_(sheets_().entries,current.entries.map(function(e){return [e.month,e.sourceId,e.amount/100];}),3);
    }else fail_('BAD_REQUEST','Неизвестный тип изменения.');
    return read_();
  }finally{lock.releaseLock();}
}
