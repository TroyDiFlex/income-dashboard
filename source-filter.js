import {sortSources} from './model.js';

export const SOURCE_FILTER_KEY='potok-source-filter';
const escapeHtml=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

export function sourceSelectionLabel(selection,sources){
 if(!selection.length)return 'Источники не выбраны';
 if(selection.length===1)return selection[0]==='all'?'Общий доход':sources.find(source=>source.id===selection[0])?.name||'';
 return selection.includes('all')?`Общий доход + ${selection.length-1}`:`Выбрано источников: ${selection.length}`;
}

export function restoreSourceSelection(storage){
 try{const saved=JSON.parse(storage.getItem(SOURCE_FILTER_KEY));if(Array.isArray(saved)&&saved.every(id=>typeof id==='string'))return [...new Set(saved)];}catch{}
 return ['all'];
}

export function setupSourceFilter({getSources,getSelection,setSelection,onChange,document=globalThis.document,storage=globalThis.localStorage}={}){
 const $=id=>document.getElementById(id),sources=()=>getSources()||[],selection=()=>getSelection()||[];
 function save(){try{storage.setItem(SOURCE_FILTER_KEY,JSON.stringify(selection()));}catch{}}
 function label(){return sourceSelectionLabel(selection(),sources());}
 function setOpen(open,focus=false){$('source-filter-panel').hidden=!open;$('source-filter-trigger').setAttribute('aria-expanded',String(open));if(focus)(open?$('source-toggle-all'):$('source-filter-trigger')).focus();}
 function update(){
  const selected=selection(),text=label();$('source-filter-label').textContent=text;$('source-filter-trigger').setAttribute('aria-label','Источники дохода: '+text);
  document.querySelectorAll('[data-filter-source]').forEach(input=>{input.checked=selected.includes(input.value);});
  const all=$('source-toggle-all'),complete=selected.length===sources().length+1;all.checked=complete;all.indeterminate=selected.length>0&&!complete;
  all.setAttribute('aria-label',complete?'Снять выделение':'Выбрать всё');all.parentElement.title=complete?'Снять выделение':'Выбрать всё';
 }
 function render(){
  const choices=[{id:'all',name:'Общий доход',color:'var(--accent)',active:true},...sortSources(sources())];
  $('source-filter-options').innerHTML=choices.map(source=>`<label class="source-filter-option" style="--source-color:${source.color}"><input type="checkbox" data-filter-source value="${escapeHtml(source.id)}"><span class="source-checkbox" aria-hidden="true"></span><span class="source-option-name">${escapeHtml(source.name)}${source.active?'':'<small>Неактивный</small>'}</span><i class="source-dot" style="background:${source.color}" aria-hidden="true"></i></label>`).join('');update();
 }
 function prune(){const previous=selection().length,valid=selection().filter(id=>id==='all'||sources().some(source=>source.id===id));setSelection(previous&&!valid.length?['all']:valid);}
 function reset(){setSelection(['all']);setOpen(false);$('source-filter-label').textContent='Общий доход';$('source-toggle-all').checked=false;$('source-toggle-all').indeterminate=false;}
 $('source-filter-trigger').addEventListener('click',()=>setOpen($('source-filter-panel').hidden));
 $('source-filter-trigger').addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true,true);}});
 $('source-filter').addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('source-filter-panel').hidden){event.preventDefault();setOpen(false,true);}});
 // Labels are not focusable, so wait for focus to actually land outside before closing.
 document.addEventListener('focusin',event=>{if(!$('source-filter').contains(event.target))setOpen(false);});
 document.addEventListener('pointerdown',event=>{if(!$('source-filter').contains(event.target))setOpen(false);});
 $('source-filter-options').addEventListener('change',event=>{
  const input=event.target.closest('[data-filter-source]');if(!input)return;
  setSelection(input.checked?[...new Set([...selection(),input.value])]:selection().filter(id=>id!==input.value));save();update();onChange({newSourcesOnly:true});
 });
 $('source-toggle-all').addEventListener('change',()=>{setSelection($('source-toggle-all').checked?['all',...sortSources(sources()).map(source=>source.id)]:[]);save();update();onChange({newSourcesOnly:true});});
 return {label,render,update,prune,reset,restore:()=>restoreSourceSelection(storage),setOpen};
}
