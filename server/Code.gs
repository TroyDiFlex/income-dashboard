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
// The browser accepts a 3 MiB import file; JSON escaping and the request envelope need headroom.
var MAX_REQUEST_CHARS_=4*1024*1024;
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
  if(body.action==='backup')return downloadBackup_();
  if(body.action==='createBackup')return createManualBackup_();
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
