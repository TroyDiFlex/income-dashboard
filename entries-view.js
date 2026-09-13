import {MONTH_NAMES,currentMonth,money,monthLabel,monthRange,sortSources} from './model.js';

const escapeHtml=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const icon=name=>`<svg class="icon"><use href="#i-${name}"/></svg>`;

export function entryMonths(data,year,today=currentMonth()){
 if(year!=='all')return monthRange(year+'-01',year+'-12');
 const keys=data.entries.map(entry=>entry.month).sort();
 return keys.length?monthRange(keys[0],keys.at(-1)):monthRange(today.slice(0,4)+'-01',today.slice(0,4)+'-12');
}

export function entriesTableHtml(data,year,today=currentMonth()){
 const months=entryMonths(data,year,today),amounts=new Map(),totals=new Map(),counts=new Map();
 for(const entry of data.entries){
  amounts.set(entry.sourceId+'|'+entry.month,entry.amount);
  totals.set(entry.month,(totals.get(entry.month)||0)+entry.amount);
  counts.set(entry.month,(counts.get(entry.month)||0)+1);
 }
 let rows='';
 for(const active of [true,false]){
  const sources=sortSources(data.sources).filter(source=>source.active===active);if(!sources.length)continue;
  rows+=`<tr class="table-group"><td>${active?'АКТИВНЫЕ':'НЕАКТИВНЫЕ'}</td><td colspan="${months.length}"></td></tr>`;
  rows+=sources.map(source=>`<tr class="${active?'':'inactive'}"><td><button class="source-cell" data-source-edit="${escapeHtml(source.id)}"><i class="source-dot" style="background:${source.color}"></i><span class="source-name" title="${escapeHtml(source.name)}">${escapeHtml(source.name)}</span>${icon('dots')}</button></td>${months.map(month=>{
   const amount=amounts.get(source.id+'|'+month),missing=amount===undefined;
   return `<td><button class="cell-button ${missing?'empty':''}" data-cell-source="${escapeHtml(source.id)}" data-cell-month="${month}" aria-label="${escapeHtml(source.name)}, ${monthLabel(month)}: ${missing?'нет записи':escapeHtml(money(amount))}">${missing?'—':escapeHtml(money(amount).replace(/\s*₽/,''))}</button></td>`;
  }).join('')}</tr>`).join('');
 }
 if(!data.sources.length)rows=`<tr><td colspan="${months.length+1}"><div class="empty-state">Добавьте первый источник дохода.</div></td></tr>`;
 rows+=`<tr class="table-total"><td>Итого, ₽</td>${months.map(month=>`<td>${counts.has(month)?escapeHtml(money(totals.get(month)).replace(/\s*₽/,'')):'—'}</td>`).join('')}</tr>`;
 return `<table><thead><tr><th>Источник / ₽</th>${months.map(month=>`<th class="${month===today?'current-col':''}">${MONTH_NAMES[+month.slice(5)-1]}${year==='all'?'<br>'+month.slice(0,4):''}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

export function monthFieldsHtml(data,month){
 let html='';const amounts=new Map(data.entries.filter(entry=>entry.month===month).map(entry=>[entry.sourceId,entry.amount]));
 for(const active of [true,false]){
  const sources=sortSources(data.sources).filter(source=>source.active===active);if(!sources.length)continue;
  html+=`<div class="month-fields-label">${active?'АКТИВНЫЕ':'НЕАКТИВНЫЕ'}</div>`;
  html+=sources.map(source=>{
   const amount=amounts.get(source.id),value=amount===undefined?'':(amount/100).toString().replace('.',',');
   return `<div class="month-row"><button type="button" class="month-source ${active?'':'inactive'}" data-source-edit="${escapeHtml(source.id)}" aria-label="Настроить источник ${escapeHtml(source.name)}"><i class="source-dot" style="background:${source.color}"></i><span>${escapeHtml(source.name)}</span>${icon('dots')}</button><input aria-label="${escapeHtml(source.name)}, сумма за ${monthLabel(month)}" id="month-${escapeHtml(source.id)}" data-month-source="${escapeHtml(source.id)}" type="text" inputmode="decimal" placeholder="Нет записи" value="${value}" autocomplete="off"></div>`;
  }).join('');
 }
 return html||'<div class="empty-state">Добавьте источник дохода, чтобы начать.</div>';
}

export function sourceOptionsHtml(data){
 return sortSources(data.sources).map(source=>`<option value="${escapeHtml(source.id)}">${escapeHtml(source.name)}${source.active?'':' · неактивный'}</option>`).join('');
}

export function entryInputValue(data,sourceId,month){
 const entry=data.entries.find(item=>item.sourceId===sourceId&&item.month===month);
 return entry?(entry.amount/100).toString().replace('.',','):'';
}
