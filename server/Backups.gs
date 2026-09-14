/** Versioned exact backups stored in the configured private Drive folder. */
function backupEnvelope_(model,reason){
  var createdAt=Date.now(),sources=model.sources.map(function(source){return Object.assign({},source);}),entries=model.entries.map(function(entry){return Object.assign({},entry);});
  return {schema:BACKUP_SCHEMA_,version:BACKUP_VERSION_,createdAt:createdAt,reason:reason,checksum:hash_(JSON.stringify([sources,entries])),data:{sources:sources,entries:entries}};
}
function backupFolder_(){
  var id=PropertiesService.getScriptProperties().getProperty('BACKUP_FOLDER_ID');
  if(!id)fail_('BACKUP_SETUP','Для безопасной операции сначала настройте папку резервных копий.');
  try{return DriveApp.getFolderById(id);}catch(error){fail_('BACKUP_SETUP','Папка резервных копий недоступна. Проверьте BACKUP_FOLDER_ID и разрешения.');}
}
function ensureBackupFolder_(){
  var properties=PropertiesService.getScriptProperties(),id=properties.getProperty('BACKUP_FOLDER_ID');
  if(id)return backupFolder_();
  try{
    var folder=DriveApp.createFolder('Potok Backups');
    properties.setProperty('BACKUP_FOLDER_ID',folder.getId());
    return folder;
  }catch(error){fail_('BACKUP_SETUP','Не удалось создать папку резервных копий на Google Drive.');}
}
function backupName_(createdAt){return 'potok-backup-'+new Date(createdAt).toISOString().replace(/[:.]/g,'-')+'.json';}
function createDriveBackup_(reason,model){
  var envelope=backupEnvelope_(model||readModel_(),reason),name=backupName_(envelope.createdAt),file;
  try{file=backupFolder_().createFile(name,JSON.stringify(envelope),MimeType.PLAIN_TEXT);file.setDescription('Автоматическая резервная копия «Потока». Причина: '+reason+'.');}
  catch(error){if(error.apiCode)throw error;fail_('BACKUP','Не удалось создать резервную копию. Изменения не применены.');}
  return {fileId:file.getId(),name:name,createdAt:envelope.createdAt,reason:reason};
}
function lockedBackup_(reason,saveToDrive){
  var lock=LockService.getScriptLock();if(!lock.tryLock(15000))fail_('BUSY','Другая запись ещё сохраняется. Попробуйте снова.');
  try{var model=readModel_();return saveToDrive?createDriveBackup_(reason,model):backupEnvelope_(model,reason);}finally{lock.releaseLock();}
}
function downloadBackup_(){return lockedBackup_('download',false);}
function createManualBackup_(){return lockedBackup_('manual',true);}
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
