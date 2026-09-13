/** Validates and atomically applies CSV imports and exact backup restores. */
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
