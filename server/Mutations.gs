/** Serialized, revision-checked changes to sources and income records. */
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
      validateModel_(current.sources,current.entries);writeSources_(current.sources);
    }else if(op.type==='setEntries'){
      if(!Array.isArray(op.entries)||!op.entries.length||op.entries.length>200)fail_('VALIDATION','Некорректный список сумм.');
      var seen={};op.entries.forEach(function(e){if(!e||!current.sources.some(function(s){return s.id===e.sourceId&&!s.deletedAt;})||!validMonth_(e.month)||!(e.amount===null||validAmount_(e.amount)))fail_('VALIDATION','Проверьте месяц, источник и сумму.');var key=e.sourceId+'|'+e.month;if(seen[key])fail_('VALIDATION','Повторная запись.');seen[key]=true;});
      op.entries.forEach(function(e){current.entries=current.entries.filter(function(old){return !(old.sourceId===e.sourceId&&old.month===e.month);});if(e.amount!==null)current.entries.push({sourceId:e.sourceId,month:e.month,amount:e.amount});});
      current.entries.sort(function(a,b){return a.month.localeCompare(b.month)||a.sourceId.localeCompare(b.sourceId);});
      if(current.entries.length>20000)fail_('VALIDATION','Достигнут предел: 20 000 записей.');
      validateModel_(current.sources,current.entries);writeRows_(sheets_().entries,current.entries.map(function(e){return [e.month,e.sourceId,e.amount/100];}),3);
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
