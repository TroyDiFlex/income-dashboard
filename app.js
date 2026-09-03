import {CONFIG} from './config.js';
import {Api,SESSION_KEY} from './api.js';
import {incomeChart,chartGeometry,lineRevealStarts} from './chart.js';
import {MONTH_NAMES,COLORS,currentMonth,monthLabel,monthRange,parseAmount,money,number,sortSources,summarize,recentMedian,validateData,validMonth} from './model.js';
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ico=name=>`<svg class="icon"><use href="#i-${name}"/></svg>`;
const api=new Api();
let comparisonMode='total';
try{const saved=localStorage.getItem('potok-comparison-mode');if(['total','average'].includes(saved))comparisonMode=saved;}catch{}
let data=null,view='overview',period='all',chartType='line',sourceFilter=['all'],selectedYear=currentMonth().slice(0,4),selectedMonth=currentMonth(),customFrom='',customTo='',tableYear=currentMonth().slice(0,4),entryMode=matchMedia('(max-width:650px)').matches?'month':'table',sourceColor=COLORS[0],busy=false,chartSelection=-1,toastTimer,authAttempt=0,restoring=false;
function theme(value){if(!['violet','midnight','forest','light'].includes(value))value='violet';document.documentElement.dataset.theme=value;try{localStorage.setItem('potok-theme',value);}catch{}document.querySelectorAll('.theme-options button').forEach(b=>b.classList.toggle('selected',b.dataset.theme===value));}
try{theme(localStorage.getItem('potok-theme')||'violet');}catch{theme('violet');}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function banner(message,error=false){$('connection-banner').textContent=message;$('connection-banner').hidden=!message;$('connection-banner').classList.toggle('error',error);}
function errorMessage(error){if(error.code==='SESSION'){lock();return 'Сессия закончилась. Войдите снова.';}if(error.code==='CONFLICT')return 'Данные изменены на другом устройстве или в таблице. Закройте форму, нажмите «Обновить» и повторите изменение. Введённые значения пока сохранены в форме.';return error.message||'Не удалось сохранить. Попробуйте ещё раз.';}
function showLogin(message=''){$('session-status').hidden=true;$('login-form').hidden=false;$('login-submit').disabled=false;$('login-error').textContent=message;}
function lock(){authAttempt++;restoring=false;api.logout().catch(()=>{});data=null;chartModel=null;sourceFilter=['all'];setSourceFilterOpen(false);$('source-filter-label').textContent='Все источники';$('source-toggle-all').checked=false;$('source-toggle-all').indeterminate=false;document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('workspace').hidden=true;$('lock-screen').hidden=false;$('password').value='';showLogin();['chart','chart-legend','metrics','comparison','share-legend','donut','table-container','month-fields','hero-total','hero-caption','chart-range','updated-at','month-total','edit-source','source-filter-options'].forEach(id=>$(id).replaceChildren());$('edit-form').reset();$('source-form').reset();$('month-error').textContent='';$('toast').hidden=true;banner('');$('password').focus();}
function openWorkspace(result){data=validateData(result);sourceFilter=restoreSourceFilter();$('password').value='';$('lock-screen').hidden=true;$('workspace').hidden=false;const months=data.entries.map(e=>e.month).sort();if(months.length){selectedYear=months.at(-1).slice(0,4);tableYear=selectedYear;selectedMonth=months.at(-1);}customFrom=months[0]||currentMonth();customTo=months.at(-1)||currentMonth();$('entry-month').value=currentMonth();render();navigate();}
async function restoreSession(){
 if(!api.token||restoring||data)return;
 const attempt=++authAttempt;restoring=true;$('login-form').hidden=true;$('session-status').hidden=false;$('session-message').textContent='Восстанавливаем вход…';$('session-retry').hidden=true;
 try{const result=await api.read();if(attempt===authAttempt)openWorkspace(result);}
 catch(error){if(attempt!==authAttempt)return;if(error.code==='SESSION'){showLogin('Сессия закончилась. Войдите снова.');}else{$('session-message').textContent=error.message;$('session-retry').hidden=false;}}
 finally{if(attempt===authAttempt)restoring=false;}
}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const attempt=++authAttempt;$('login-error').textContent='';$('login-submit').disabled=true;try{const result=await api.login($('password').value);if(attempt===authAttempt)openWorkspace(result);else api.logout().catch(()=>{});}catch(error){if(attempt===authAttempt){$('login-error').textContent=error.message;api.logout().catch(()=>{});}}finally{if(attempt===authAttempt)$('login-submit').disabled=false;}});
$('session-retry').addEventListener('click',restoreSession);
$('session-reset').addEventListener('click',lock);
window.addEventListener('online',restoreSession);
window.addEventListener('storage',e=>{if((e.key===SESSION_KEY||e.key===null)&&e.newValue===null)lock();});
$('show-password').addEventListener('click',()=>{const visible=$('password').type==='password';$('password').type=visible?'text':'password';$('show-password').textContent=visible?'Скрыть':'Показать';});
$('logout').addEventListener('click',lock);
$('theme-open').addEventListener('click',()=>$('theme-dialog').showModal());
document.querySelectorAll('.theme-options button').forEach(b=>b.addEventListener('click',()=>theme(b.dataset.theme)));
document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
function navigate(){if(!data)return;view=location.hash==='#entries'?'entries':'overview';$('overview-view').hidden=view!=='overview';$('entries-view').hidden=view!=='entries';$('page-title').innerHTML=view==='overview'?'Обзор доходов<span class="title-dot">.</span>':'Ваши данные<span class="title-dot">.</span>';$('page-eyebrow').textContent=view==='overview'?'ВАШ ФИНАНСОВЫЙ ПУЛЬС':'КАЖДОЕ ПОСТУПЛЕНИЕ НА СВОЁМ МЕСТЕ';$('page-description').textContent=view==='overview'?'От отдельных поступлений — к полной картине.':'Добавляйте доходы и управляйте источниками.';document.querySelectorAll('[data-route]').forEach(a=>{a.classList.toggle('active',a.dataset.route===view);a.setAttribute('aria-current',a.dataset.route===view?'page':'false');});if(view==='overview')renderChart();else renderEntries();}
window.addEventListener('hashchange',navigate);
function periodBounds(){if(period==='year')return [selectedYear+'-01',selectedYear+'-12'];if(period==='month')return [selectedMonth,selectedMonth];if(period==='custom')return [customFrom,customTo];return ['',''];}
function years(){const set=new Set([currentMonth().slice(0,4),tableYear,selectedYear]);data.entries.forEach(e=>set.add(e.month.slice(0,4)));return [...set].filter(y=>/^\d{4}$/.test(y)).sort();}
function yearOptions(value){return years().map(y=>`<option value="${y}" ${y===value?'selected':''}>${y}</option>`).join('');}
function renderPeriod(){document.querySelectorAll('[data-period]').forEach(b=>{b.classList.toggle('selected',b.dataset.period===period);b.setAttribute('aria-pressed',String(b.dataset.period===period));});let html='';if(period==='year')html=`<label class="sr-only" for="filter-year">Год</label><select id="filter-year">${yearOptions(selectedYear)}</select>`;if(period==='month')html=`<label class="sr-only" for="filter-month">Месяц</label><input type="month" id="filter-month" value="${selectedMonth}">`;if(period==='custom')html=`<label class="sr-only" for="filter-from">Начало периода</label><input type="month" id="filter-from" value="${customFrom}"><span class="muted">—</span><label class="sr-only" for="filter-to">Конец периода</label><input type="month" id="filter-to" value="${customTo}">`;$('period-controls').innerHTML=html;
 $('filter-year')?.addEventListener('change',e=>{selectedYear=e.target.value;renderOverview();});$('filter-month')?.addEventListener('change',e=>{if(validMonth(e.target.value)){selectedMonth=e.target.value;renderOverview();}});['filter-from','filter-to'].forEach(id=>$(id)?.addEventListener('change',()=>{const from=$('filter-from').value,to=$('filter-to').value;if(!validMonth(from)||!validMonth(to)||from>to){toast('Начало периода должно быть раньше конца.');return;}customFrom=from;customTo=to;renderOverview();}));}
$('period-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-period]');if(b){period=b.dataset.period;renderPeriod();renderOverview();}});
function restoreSourceFilter(){
 try{const saved=JSON.parse(localStorage.getItem('potok-source-filter'));if(Array.isArray(saved)&&saved.every(id=>typeof id==='string'))return [...new Set(saved)];}catch{}
 return ['all'];
}
function saveSourceFilter(){
 try{localStorage.setItem('potok-source-filter',JSON.stringify(sourceFilter));}catch{}
}
function sourceSelectionLabel(){
 if(!sourceFilter.length)return 'Источники не выбраны';
 if(sourceFilter.length===1)return sourceFilter[0]==='all'?'Все источники':data.sources.find(s=>s.id===sourceFilter[0])?.name||'';
 return sourceFilter.includes('all')?`Все источники + ${sourceFilter.length-1}`:`Выбрано источников: ${sourceFilter.length}`;
}
function setSourceFilterOpen(open,focus=false){
 $('source-filter-panel').hidden=!open;$('source-filter-trigger').setAttribute('aria-expanded',String(open));
 if(focus)(open?$('source-toggle-all'):$('source-filter-trigger')).focus();
}
function updateSourceFilter(){
 $('source-filter-label').textContent=sourceSelectionLabel();
 $('source-filter-trigger').setAttribute('aria-label','Источники дохода: '+sourceSelectionLabel());
 document.querySelectorAll('[data-filter-source]').forEach(input=>{input.checked=sourceFilter.includes(input.value);});
 const all=$('source-toggle-all'),complete=sourceFilter.length===data.sources.length+1;
 all.checked=complete;all.indeterminate=sourceFilter.length>0&&!complete;
 all.setAttribute('aria-label',complete?'Снять выделение':'Выбрать всё');all.parentElement.title=complete?'Снять выделение':'Выбрать всё';
}
function renderSourceFilter(){
 const choices=[{id:'all',name:'Все источники',color:'var(--accent)',active:true},...sortSources(data.sources)];
 $('source-filter-options').innerHTML=choices.map(s=>`<label class="source-filter-option" style="--source-color:${s.color}"><input type="checkbox" data-filter-source value="${esc(s.id)}"><span class="source-checkbox" aria-hidden="true"></span><span class="source-option-name">${esc(s.name)}${s.active?'':'<small>Неактивный</small>'}</span><i class="source-dot" style="background:${s.color}" aria-hidden="true"></i></label>`).join('');
 updateSourceFilter();
}
$('source-filter-trigger').addEventListener('click',()=>setSourceFilterOpen($('source-filter-panel').hidden));
$('source-filter-trigger').addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();setSourceFilterOpen(true,true);}});
$('source-filter').addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('source-filter-panel').hidden){e.preventDefault();setSourceFilterOpen(false,true);}});
// A label click can blur the trigger before activating its checkbox. Close only when focus actually lands outside.
document.addEventListener('focusin',e=>{if(!$('source-filter').contains(e.target))setSourceFilterOpen(false);});
document.addEventListener('pointerdown',e=>{if(!$('source-filter').contains(e.target))setSourceFilterOpen(false);});
$('source-filter-options').addEventListener('change',e=>{
 const input=e.target.closest('[data-filter-source]');if(!input||!data)return;
 sourceFilter=input.checked?[...new Set([...sourceFilter,input.value])]:sourceFilter.filter(id=>id!==input.value);
 saveSourceFilter();updateSourceFilter();renderOverview({newSourcesOnly:true});
});
$('source-toggle-all').addEventListener('change',()=>{if(!data)return;sourceFilter=$('source-toggle-all').checked?['all',...sortSources(data.sources).map(s=>s.id)]:[];saveSourceFilter();updateSourceFilter();renderOverview({newSourcesOnly:true});});
document.querySelectorAll('[data-chart]').forEach(b=>b.addEventListener('click',()=>{chartType=b.dataset.chart;document.querySelectorAll('[data-chart]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderChart();}));
function render(){if(!data)return;const previous=sourceFilter.length;sourceFilter=sourceFilter.filter(id=>id==='all'||data.sources.some(s=>s.id===id));if(previous&&!sourceFilter.length)sourceFilter=['all'];renderSourceFilter();renderPeriod();renderOverview();if(view==='entries')renderEntries();$('updated-at').textContent='Обновлено '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}
function renderOverview(chartOptions){
 if(!data)return;
 const [from,to]=periodBounds(),s=summarize(data,from,to,sourceFilter),recent=recentMedian(data,sourceFilter);
 $('hero-total').innerHTML=sourceFilter.length?esc(money(s.total)).replace(/₽/,'<span class="currency">₽</span>'):'—';
 $('hero-caption').textContent=`${s.observed.length} мес. с записями · ${sourceSelectionLabel()}`;
 const medianNote=`${monthLabel(recent.from)} — ${monthLabel(recent.to)}. Месяцев с записями: ${recent.count} из 6. Учитываются выбранные источники. Период этой карточки фиксирован; пропуски не считаются нулём.`;
 const metrics=[
  ['Общий доход',money(s.total),`${s.recordCount} записей за период`,'wallet'],
  ['В среднем за месяц',money(s.average),'Только месяцы с записями','chart'],
  ['Лучший месяц',s.best?monthLabel(s.best.month,true):'—',s.best?money(s.best.total):'Нет записей','arrow'],
  ['Источники',`${s.activeSources} из ${s.totalSources}`,'активны сейчас','check'],
  ['Медианный доход',recent.median===null?'—':money(recent.median),`Последние 6 полных мес. · ${recent.count}/6 с записями`,'chart',medianNote],
  ['Самый прибыльный',s.sources[0]?.name||'—',s.sources[0]?money(s.sources[0].total):'Нет записей','arrow']
 ];
 $('metrics').innerHTML=metrics.map((m,i)=>`<article class="metric"${m[4]?` title="${esc(m[4])}"`:''}><div class="metric-label">${esc(m[0])}${ico(m[3])}</div><div class="metric-value ${i===5?'name':''}">${esc(m[1])}</div><div class="metric-foot">${esc(m[2])}</div></article>`).join('');
 renderBreakdowns(s);renderChart(chartOptions);
}
function renderBreakdowns(s){$('share-count').textContent=`${s.sources.length} ист.`;let offset=0;const positive=s.sources.filter(x=>x.total>0);const circumference=2*Math.PI*63;const rings=positive.map(x=>{const fraction=x.total/s.total,dash=Math.max(0,circumference*fraction-3);const svg=`<circle cx="80" cy="80" r="63" stroke="${x.color}" stroke-dasharray="${dash} ${circumference-dash}" stroke-dashoffset="${-offset}"/>`;offset+=circumference*fraction;return svg;}).join('');$('donut').innerHTML=`<svg viewBox="0 0 160 160" role="img" aria-label="Доли источников дохода"><circle cx="80" cy="80" r="63" stroke="var(--grid)"/>${rings}</svg><div class="donut-center"><strong>${s.total?'100%':'—'}</strong><span>${s.total?'общий доход':'нет дохода'}</span></div>`;$('share-legend').innerHTML=s.sources.length?s.sources.map(x=>`<div class="share-item"><i class="source-dot" style="background:${x.color}"></i><span class="label" title="${esc(x.name)}">${esc(x.name)}</span><strong>${s.total?(100*x.total/s.total).toLocaleString('ru-RU',{maximumFractionDigits:1}):'0'}%</strong></div>`).join(''):'<p class="muted help">В этом периоде пока нет записей.</p>';renderComparison(s);}
function renderComparison(s){
 const average=comparisonMode==='average';
 const sources=[...s.sources].sort((a,b)=>b[comparisonMode]-a[comparisonMode]||b.total-a.total);
 const maximum=sources[0]?.[comparisonMode]||0;
 document.querySelectorAll('[data-comparison]').forEach(button=>{
  const selected=button.dataset.comparison===comparisonMode;
  button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
 });
 $('comparison-kicker').textContent=average?'ДОХОД ЗА МЕСЯЦ С ЗАПИСЬЮ':'ВКЛАД В ОБЩИЙ ДОХОД';
 $('comparison').innerHTML=sources.length?sources.map(x=>`<div class="comparison-item"><div class="comparison-heading"><i class="source-dot" style="background:${x.color}"></i><span title="${esc(x.name)}">${esc(x.name)}</span><strong>${esc(money(x[comparisonMode]))}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${maximum?x[comparisonMode]/maximum*100:0}%;background:${x.color}"></div></div><div class="comparison-meta"><span>${x.active?'Активный':'Неактивный'} · ${x.count} мес. с записями</span>${average?'':`<span>${s.total?(100*x.total/s.total).toLocaleString('ru-RU',{maximumFractionDigits:1}):'0'}%</span>`}</div></div>`).join(''):'<div class="empty-state"><h3>Пока нечего сравнивать</h3>Выберите другой период или добавьте доход.</div>';
}
$('comparison-mode').addEventListener('click',e=>{
 const button=e.target.closest('[data-comparison]');if(!button||!data)return;
 const mode=button.dataset.comparison;if(!['total','average'].includes(mode)||mode===comparisonMode)return;
 comparisonMode=mode;try{localStorage.setItem('potok-comparison-mode',mode);}catch{}
 renderComparison(summarize(data,...periodBounds(),sourceFilter));
});

let chartModel=null;
function renderChart({animate=true,newSourcesOnly=false}={}){
 if(!data||view!=='overview')return;
 const model=incomeChart(data,...periodBounds(),sourceFilter),s=model.summary,container=$('chart');
 const legend=chartType==='bars'?model.bars:model.lines;
 $('chart-legend').innerHTML=legend.map(series=>`<span class="chart-legend-item"><i class="legend-line" style="background:${series.color}"></i><span>${esc(series.name)}</span></span>`).join('');
 container.setAttribute('aria-label',`Доходы по месяцам. ${sourceSelectionLabel()}. Стрелки влево и вправо — просмотр месяцев.`);
 if(!s.observed.length){
  container.innerHTML=sourceFilter.length?'<div class="empty-state"><h3>Здесь появится ваш график</h3>Добавьте доход или выберите другой период.</div>':'<div class="empty-state"><h3>Выберите источники</h3>Отметьте их в списке над графиком.</div>';
  $('chart-range').textContent=sourceFilter.length?'Нет записей':'';chartModel=null;return;
 }
 const now=performance.now(),previous=newSourcesOnly&&chartModel?.type===chartType?chartModel:null;
 const lineReveals=animate&&chartType!=='bars'?lineRevealStarts(model,previous,now):new Map();
 const geometry=chartGeometry(model,chartType,container.clientWidth,container.clientHeight,{animate,lineReveals,now});
 container.innerHTML=geometry.svg+'<div id="chart-tooltip" class="tooltip" hidden></div>';
 chartModel={...geometry,s,model,type:chartType,lineReveals};chartSelection=-1;
 $('chart-range').textContent=`${monthLabel(s.months[0].month,true)} — ${monthLabel(s.months.at(-1).month,true)}`;
}
function hideChartTooltip(){if($('chart-tooltip'))$('chart-tooltip').hidden=true;$('crosshair')?.setAttribute('opacity','0');document.querySelectorAll('.hover-dot').forEach(dot=>dot.setAttribute('opacity','0'));}
function chartTooltip(index){
 if(!chartModel)return;
 const {s,x,y,width,model,hoverSeries}=chartModel;
 index=Math.max(0,Math.min(s.months.length-1,index));
 const m=s.months[index],tip=$('chart-tooltip');
 if(index===chartSelection&&!tip.hidden)return;
 chartSelection=index;
 // Start each hover at its selected month; animate only subsequent movement.
 tip.style.transition=tip.hidden?'none':'';
 let rows=chartType==='bars'?model.bars:model.lines.filter(series=>series.id!=='all');
 if(sourceFilter.length===1&&sourceFilter[0]==='all')rows=sortSources(data.sources).map(src=>({...src,months:summarize(data,...periodBounds(),src.id).months}));
 tip.innerHTML=`<small>${monthLabel(m.month)} · ${sourceFilter.includes('all')?'Все источники':'Выбранные источники'}</small><b>${m.count?esc(money(m.total)):'Нет записей'}</b>`+rows.map(series=>{
  const point=series.months[index];return `<div class="tooltip-row"><span title="${esc(series.name)}"><i class="source-dot" style="background:${series.color}"></i>${esc(series.name)}</span><span>${point.count?esc(money(point.total)):'Нет записи'}</span></div>`;
 }).join('');
 tip.hidden=false;
 const highest=hoverSeries.reduce((max,series)=>Math.max(max,series.months[index].total),0);
 const chart=$('chart'),gap=16,pointX=x(index)*chart.clientWidth/width;
 const tipWidth=tip.offsetWidth,tipHeight=tip.offsetHeight;
 // Prefer the left of the crosshair, flipping right only near the left edge.
 const beside=pointX-tipWidth-gap>=0?pointX-tipWidth-gap:pointX+gap;
 const tipX=Math.max(0,Math.min(chart.clientWidth-tipWidth,beside));
 const tipY=Math.max(0,Math.min(chart.clientHeight-tipHeight-20,y(highest)-tipHeight-15));
 tip.style.transform=`translate3d(${tipX}px,${tipY}px,0)`;
 $('crosshair').setAttribute('x1',x(index));$('crosshair').setAttribute('x2',x(index));$('crosshair').setAttribute('opacity','.5');
 hoverSeries.forEach((series,i)=>{const point=series.months[index],dot=$('hover-dot-'+i);dot.setAttribute('cx',x(index));dot.setAttribute('cy',y(point.total));dot.setAttribute('opacity',point.count?'1':'0');});
}
$('chart').addEventListener('pointermove',e=>{if(chartModel){const r=$('chart').getBoundingClientRect();chartTooltip(Math.floor(((e.clientX-r.left)*chartModel.width/r.width-chartModel.left)/chartModel.step));}});
$('chart').addEventListener('pointerleave',hideChartTooltip);
$('chart').addEventListener('blur',hideChartTooltip);
$('chart').addEventListener('keydown',e=>{if(!chartModel)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();chartTooltip(chartSelection+(e.key==='ArrowRight'?1:-1));}if(e.key==='Escape')hideChartTooltip();});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>renderChart({animate:false}),150);});
async function refresh(){if(!data||busy)return;const attempt=authAttempt;busy=true;$('refresh').disabled=true;try{const result=await api.read();if(attempt!==authAttempt)return;data=validateData(result);banner('');render();toast('Данные обновлены');}catch(e){if(attempt===authAttempt)banner(errorMessage(e),true);}finally{busy=false;$('refresh').disabled=false;}}
$('refresh').addEventListener('click',refresh);
async function mutate(operation,form,errorId,success){if(busy)return;const attempt=authAttempt;busy=true;const buttons=form.querySelectorAll('button[type="submit"]');buttons.forEach(b=>b.disabled=true);$(errorId).textContent='';try{const result=await api.mutate(data.revision,operation);if(attempt!==authAttempt)return;data=validateData(result);banner('');form.closest('dialog')?.close();render();toast(success);}catch(e){if(attempt===authAttempt)$(errorId).textContent=errorMessage(e);}finally{busy=false;buttons.forEach(b=>b.disabled=false);}}
function renderEntries(){if(!data)return;$('table-year').innerHTML=yearOptions(tableYear)+'<option value="all">Все годы</option>';$('table-year').value=tableYear;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===entryMode));$('table-container').hidden=entryMode!=='table';$('month-form').hidden=entryMode!=='month';document.querySelector('.year-navigation').style.display=entryMode==='table'?'flex':'none';if(entryMode==='month'){renderMonth();return;}let months;if(tableYear==='all'){const keys=data.entries.map(e=>e.month).sort();months=keys.length?monthRange(keys[0],keys.at(-1)):monthRange(currentMonth().slice(0,4)+'-01',currentMonth().slice(0,4)+'-12');}else months=monthRange(tableYear+'-01',tableYear+'-12');const map=new Map(data.entries.map(e=>[e.sourceId+'|'+e.month,e.amount]));let rows='';for(const active of [true,false]){const sources=sortSources(data.sources).filter(s=>s.active===active);if(!sources.length)continue;rows+=`<tr class="table-group"><td>${active?'АКТИВНЫЕ':'НЕАКТИВНЫЕ'}</td><td colspan="${months.length}"></td></tr>`;rows+=sources.map(s=>`<tr class="${active?'':'inactive'}"><td><button class="source-cell" data-source-edit="${esc(s.id)}"><i class="source-dot" style="background:${s.color}"></i><span class="source-name" title="${esc(s.name)}">${esc(s.name)}</span>${ico('dots')}</button></td>${months.map(m=>{const a=map.get(s.id+'|'+m);return `<td><button class="cell-button ${a===undefined?'empty':''}" data-cell-source="${esc(s.id)}" data-cell-month="${m}" aria-label="${esc(s.name)}, ${monthLabel(m)}: ${a===undefined?'нет записи':esc(money(a))}">${a===undefined?'—':esc(money(a).replace(/\s*₽/,''))}</button></td>`;}).join('')}</tr>`).join('');}if(!data.sources.length)rows=`<tr><td colspan="${months.length+1}"><div class="empty-state">Добавьте первый источник дохода.</div></td></tr>`;rows+=`<tr class="table-total"><td>Итого, ₽</td>${months.map(m=>{const entries=data.entries.filter(e=>e.month===m);return `<td>${entries.length?esc(money(entries.reduce((v,e)=>v+e.amount,0)).replace(/\s*₽/,'')):'—'}</td>`;}).join('')}</tr>`;$('table-container').innerHTML=`<table><thead><tr><th>Источник / ₽</th>${months.map(m=>`<th class="${m===currentMonth()?'current-col':''}">${MONTH_NAMES[+m.slice(5)-1]}${tableYear==='all'?'<br>'+m.slice(0,4):''}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;}
$('entry-mode').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(b){entryMode=b.dataset.mode;renderEntries();}});$('table-year').addEventListener('change',e=>{tableYear=e.target.value;renderEntries();});$('prev-year').addEventListener('click',()=>{tableYear=String(Math.max(1900,Number(tableYear==='all'?currentMonth().slice(0,4):tableYear)-1));renderEntries();});$('next-year').addEventListener('click',()=>{tableYear=String(Math.min(2199,Number(tableYear==='all'?currentMonth().slice(0,4):tableYear)+1));renderEntries();});
$('table-container').addEventListener('click',e=>{const cell=e.target.closest('[data-cell-source]'),source=e.target.closest('[data-source-edit]');if(cell)openEdit(cell.dataset.cellSource,cell.dataset.cellMonth);if(source)openSource(source.dataset.sourceEdit);});
function openEdit(sourceId,month=currentMonth()){if(!data.sources.length){openSource();return;}$('edit-error').textContent='';$('edit-title').textContent=sourceId?'Изменить доход':'Добавить доход';$('edit-source').innerHTML=sortSources(data.sources).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}${s.active?'':' · неактивный'}</option>`).join('');if(sourceId)$('edit-source').value=sourceId;$('edit-month').value=month;fillEditAmount();$('edit-dialog').showModal();setTimeout(()=>$('edit-amount').focus(),0);}
function fillEditAmount(){const entry=data.entries.find(e=>e.sourceId===$('edit-source').value&&e.month===$('edit-month').value);$('edit-amount').value=entry?(entry.amount/100).toString().replace('.',','):'';}
$('edit-source').addEventListener('change',fillEditAmount);$('edit-month').addEventListener('change',fillEditAmount);$('quick-add').addEventListener('click',()=>openEdit());
$('edit-form').addEventListener('submit',e=>{e.preventDefault();try{const amount=parseAmount($('edit-amount').value),month=$('edit-month').value;if(!validMonth(month))throw new Error('Выберите корректный месяц.');mutate({type:'setEntries',entries:[{sourceId:$('edit-source').value,month,amount}]},e.target,'edit-error','Доход сохранён');}catch(error){$('edit-error').textContent=error.message;}});
function renderMonth(){const month=$('entry-month').value||currentMonth();$('entry-month').value=month;let html='';for(const active of [true,false]){const sources=sortSources(data.sources).filter(s=>s.active===active);if(!sources.length)continue;html+=`<div class="month-fields-label">${active?'АКТИВНЫЕ':'НЕАКТИВНЫЕ'}</div>`;html+=sources.map(s=>{const entry=data.entries.find(e=>e.month===month&&e.sourceId===s.id);return `<div class="month-row"><label for="month-${esc(s.id)}" class="${active?'':'inactive'}"><i class="source-dot" style="background:${s.color}"></i>${esc(s.name)}</label><input id="month-${esc(s.id)}" data-month-source="${esc(s.id)}" type="text" inputmode="decimal" placeholder="Нет записи" value="${entry?(entry.amount/100).toString().replace('.',','):''}" autocomplete="off"></div>`;}).join('');}$('month-fields').innerHTML=html||'<div class="empty-state">Добавьте источник дохода, чтобы начать.</div>';$('month-error').textContent='';monthTotal();}
function monthTotal(){let total=0;try{document.querySelectorAll('[data-month-source]').forEach(i=>{total+=parseAmount(i.value)||0;});$('month-total').textContent='Итого: '+money(total);}catch{$('month-total').textContent='Проверьте суммы';}}
$('entry-month').addEventListener('change',()=>{if(validMonth($('entry-month').value))renderMonth();});$('month-fields').addEventListener('input',monthTotal);
$('month-form').addEventListener('submit',e=>{e.preventDefault();try{const month=$('entry-month').value;if(!validMonth(month))throw new Error('Выберите корректный месяц.');const entries=[...document.querySelectorAll('[data-month-source]')].map(i=>({sourceId:i.dataset.monthSource,month,amount:parseAmount(i.value)}));if(!entries.length)throw new Error('Сначала добавьте источник.');mutate({type:'setEntries',entries},e.target,'month-error','Месяц сохранён');}catch(error){$('month-error').textContent=error.message;}});
function renderColors(){$('source-colors').innerHTML=COLORS.map(c=>`<button type="button" class="color-option ${c===sourceColor?'selected':''}" data-color="${c}" style="background:${c}" aria-label="Цвет ${c}" aria-pressed="${c===sourceColor}"></button>`).join('');}
function openSource(id){const s=data.sources.find(s=>s.id===id);$('source-id').value=s?.id||'';$('source-name').value=s?.name||'';$('source-active').checked=s?.active??true;$('source-title').textContent=s?'Настроить источник':'Новый источник';$('source-error').textContent='';sourceColor=s?.color||COLORS[data.sources.length%COLORS.length];renderColors();$('source-dialog').showModal();}
$('source-colors').addEventListener('click',e=>{const b=e.target.closest('[data-color]');if(b){sourceColor=b.dataset.color;renderColors();}});$('add-source').addEventListener('click',()=>openSource());
$('source-form').addEventListener('submit',e=>{e.preventDefault();const name=$('source-name').value.trim();if(!name){$('source-error').textContent='Укажите название источника.';return;}const id=$('source-id').value||crypto.randomUUID();mutate({type:'setSource',source:{id,name,color:sourceColor,active:$('source-active').checked,order:data.sources.find(s=>s.id===id)?.order??data.sources.length}},e.target,'source-error','Источник сохранён');});
$('export-data').addEventListener('click',()=>{if(!data)return;const safe=value=>'"'+String(value).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';const rows=[['Месяц','Источник','Сумма, ₽','Статус'],...data.entries.toSorted((a,b)=>a.month.localeCompare(b.month)||a.sourceId.localeCompare(b.sourceId)).map(e=>{const s=data.sources.find(s=>s.id===e.sourceId);return [e.month,s?.name||'',(e.amount/100).toString().replace('.',','),s?.active?'Активный':'Неактивный'];})];const blob=new Blob(['\ufeff'+rows.map(r=>r.map(safe).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Доходы.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV содержит ваши доходы. Храните файл в безопасном месте.');});
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
if(!CONFIG.apiUrl)$('login-error').textContent='Подключение к Google ещё настраивается. Ваши доходы не хранятся в коде сайта.';
else restoreSession();
