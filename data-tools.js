import {backupFilename,csvFilename,exportWideCsv,parseBackup,planWideCsvImport,verifyBackupChecksum} from './data-transfer.js';

export const MAX_IMPORT_BYTES=3*1024*1024;

export function importSummary(changes){
 return `Источники: +${changes.sourcesAdded}, изменится ${changes.sourcesChanged}. Суммы: +${changes.entriesAdded}, изменится ${changes.entriesChanged}, удалится ${changes.entriesDeleted}.`;
}

export async function inspectImport(data,text,{fileName='',mode='merge'}={}){
 if(fileName.toLowerCase().endsWith('.json')||text.trimStart().startsWith('{')){
  const backup=parseBackup(text);
  await verifyBackupChecksum(backup);
  const trashed=backup.data.sources.filter(source=>source.deletedAt).length;
  return {kind:'backup',backup,summary:`Полное восстановление: ${backup.data.sources.length} источников, ${backup.data.entries.length} сумм, в корзине ${trashed}. Текущие данные будут предварительно сохранены на Google Drive.`};
 }
 const plan=planWideCsvImport(data,text,{mode});
 return {kind:'csv',plan,summary:importSummary(plan.changes)};
}

export function setupDataTools({api,getData,isBusy,canOpen,mutate,toast,errorMessage,document=globalThis.document,window=globalThis.window}={}){
 const $=id=>document.getElementById(id);
 let importPlan=null,importFileText='',importFileName='';

 function downloadFile(contents,name,type){
  const blob=new window.Blob([contents],{type}),url=window.URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;link.hidden=true;document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);
 }
 function resetImport(){
  importPlan=null;importFileText='';importFileName='';$('import-form').reset();
  $('import-preview').textContent='Выберите файл для проверки.';$('import-preview').classList.remove('ready');
  $('import-error').textContent='';$('import-apply').disabled=true;
 }
 async function prepareImport(reuseText=false){
  const file=$('import-file').files[0];importPlan=null;$('import-apply').disabled=true;$('import-error').textContent='';$('import-preview').classList.remove('ready');
  if(!file&&!reuseText){$('import-preview').textContent='Выберите файл для проверки.';return;}
  try{
   if(!reuseText){
    if(file.size>MAX_IMPORT_BYTES)throw new Error('Файл превышает допустимый размер 3 МБ.');
    importFileName=file.name;importFileText=await file.text();
   }
   importPlan=await inspectImport(getData(),importFileText,{fileName:importFileName,mode:$('import-mode').value});
   $('import-preview').textContent=importPlan.summary;$('import-preview').classList.add('ready');$('import-apply').disabled=false;
  }catch(error){
   $('import-preview').textContent=`Файл «${importFileName||file?.name||''}» не прошёл проверку.`;
   $('import-error').textContent=error.message;
  }
 }

 $('data-tools').addEventListener('click',()=>{if(!getData()||isBusy()||!canOpen())return;resetImport();$('backup-status').textContent='';$('data-dialog').showModal();});
 $('export-csv').addEventListener('click',()=>{const data=getData();if(!data)return;downloadFile(exportWideCsv(data),csvFilename(),'text/csv;charset=utf-8');toast('Редактируемая таблица CSV сохранена');});
 $('export-backup').addEventListener('click',async()=>{
  if(!getData()||isBusy())return;const button=$('export-backup');button.disabled=true;$('backup-status').textContent='Подготавливаем полную копию…';
  try{const backup=await api.backup();downloadFile(JSON.stringify(backup,null,2),backupFilename(backup.createdAt),'application/json;charset=utf-8');$('backup-status').textContent='Полная копия скачана.';}
  catch(error){$('backup-status').textContent=errorMessage(error);}finally{button.disabled=false;}
 });
 $('create-drive-backup').addEventListener('click',async()=>{
  if(!getData()||isBusy())return;const button=$('create-drive-backup');button.disabled=true;$('backup-status').textContent='Создаём копию…';
  try{const result=await api.createBackup();$('backup-status').textContent=`Создан файл ${result.name}.`;}
  catch(error){$('backup-status').textContent=errorMessage(error);}finally{button.disabled=false;}
 });
 $('setup-drive-backups').addEventListener('click',async()=>{
  if(!getData()||isBusy())return;const button=$('setup-drive-backups'),status=$('backup-status');button.disabled=true;status.textContent='Настраиваем ежедневные копии…';
  try{
   const result=await api.backupMaintenance();
   if(result.scheduled)status.textContent='Ежедневные копии включены. Создана контрольная копия.';
   else{
    status.textContent='Google требует разовое разрешение. ';
    const authorizationUrl=new window.URL(result.authorizationUrl);if(authorizationUrl.protocol!=='https:'||authorizationUrl.hostname!=='script.google.com')throw new Error('Сервер вернул некорректную ссылку авторизации.');
    const link=document.createElement('a');link.href=authorizationUrl.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Выдать разрешение';status.append(link);
   }
  }catch(error){status.textContent=errorMessage(error);}finally{button.disabled=false;}
 });
 $('import-file').addEventListener('change',()=>prepareImport());
 $('import-mode').addEventListener('change',()=>{if(importFileText)prepareImport(true);});
 $('import-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!importPlan||isBusy())return;
  const operation=importPlan.kind==='backup'?{type:'restoreBackup',backup:importPlan.backup}:{type:'importData',data:{sources:importPlan.plan.data.sources,entries:importPlan.plan.data.entries}};
  const success=await mutate(operation,event.target,'import-error',importPlan.kind==='backup'?'Резервная копия восстановлена':'Импорт применён');
  if(success)resetImport();
 });

 return {resetImport,prepareImport,get plan(){return importPlan;}};
}
