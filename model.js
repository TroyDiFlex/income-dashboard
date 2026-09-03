export const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
export const SHORT_MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
export const COLORS = ['#a78bfa','#5ed9bc','#f5bd72','#ec88bf','#79b8ff','#d3d96c','#ff9292','#b5b0ce',
  '#68c8d9','#8f9bea','#d99caa','#d99b7c','#94c987'];
export const validMonth = value => typeof value === 'string' && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value);
export const monthLabel = (value, short = false) => validMonth(value) ? `${(short ? SHORT_MONTHS : MONTH_NAMES)[Number(value.slice(5))-1]} ${value.slice(0,4)}` : '—';
export const currentMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
export function monthRange(from, to) {
  if (!validMonth(from) || !validMonth(to) || from > to) return [];
  const result = []; let y = Number(from.slice(0,4)), m = Number(from.slice(5));
  for (let i=0;i<2400;i++) { const key=`${y}-${String(m).padStart(2,'0')}`; if(key>to) break; result.push(key); if(++m===13){m=1;y++;} }
  return result;
}
export function parseAmount(input) {
  const clean=String(input).trim().replace(/[\s\u00a0\u202f₽]/g,'').replace(',','.');
  if(clean==='') return null;
  if(!/^\d{1,10}(\.\d{1,2})?$/.test(clean)) throw new Error('Введите сумму от 0 до 9 999 999 999,99 ₽, не больше двух знаков после запятой.');
  const [whole,cents='']=clean.split('.'); return Number(whole)*100+Number(cents.padEnd(2,'0'));
}
export const money = (cents, compact=false) => new Intl.NumberFormat('ru-RU', {style:'currency',currency:'RUB',maximumFractionDigits: cents%100 ? 2 : 0, ...(compact?{notation:'compact',maximumFractionDigits:1}:{})}).format(cents/100);
export const number = value => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(value);
export const sortSources = sources => [...sources].sort((a,b)=>Number(b.active)-Number(a.active) || a.order-b.order || a.name.localeCompare(b.name,'ru'));
export function summarize(data, from, to, selected = 'all') {
  const selection=new Set(Array.isArray(selected)?selected:[selected]);
  const relevant = data.entries.filter(e=>(!from||e.month>=from)&&(!to||e.month<=to)&&(selection.has('all')||selection.has(e.sourceId)));
  const allMonths=[...new Set(data.entries.map(e=>e.month))].sort();
  const start=from||allMonths[0], end=to||allMonths.at(-1);
  const months=monthRange(start,end).map(month=>({month,total:0,count:0}));
  const byMonth=new Map(months.map(m=>[m.month,m]));
  const bySource=new Map(data.sources.map(s=>[s.id,{...s,total:0,count:0}]));
  relevant.forEach(e=>{const m=byMonth.get(e.month), s=bySource.get(e.sourceId); if(m){m.total+=e.amount;m.count++;} if(s){s.total+=e.amount;s.count++;}});
  const observed=months.filter(m=>m.count>0), total=relevant.reduce((s,e)=>s+e.amount,0);
  const sources=[...bySource.values()].filter(s=>s.count>0).map(s=>({...s,average:Math.round(s.total/s.count)})).sort((a,b)=>b.total-a.total);
  const best=observed.reduce((best,m)=>!best||m.total>best.total?m:best,null);
  return {months,observed,total,sources,best,average:observed.length?Math.round(total/observed.length):0,activeSources:data.sources.filter(s=>s.active).length,totalSources:data.sources.length,recordCount:relevant.length};
}
export function recentMedian(data, selected = 'all', referenceMonth = currentMonth()) {
  if(!validMonth(referenceMonth))throw new Error('Неверный месяц расчёта.');
  const year=Number(referenceMonth.slice(0,4)),month=Number(referenceMonth.slice(5))-1;
  const key=offset=>{const index=year*12+month+offset;return `${Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`;};
  const from=key(-6),to=key(-1);
  const values=summarize(data,from,to,selected).observed.map(m=>m.total).sort((a,b)=>a-b);
  const middle=Math.floor(values.length/2);
  const median=values.length?(values.length%2?values[middle]:Math.round((values[middle-1]+values[middle])/2)):null;
  return {median,from,to,count:values.length};
}
export function niceCeiling(max) {
  if(max<=0)return 10000;
  const target=max*1.08, power=10**Math.floor(Math.log10(target));
  const step=power/5; return Math.ceil(target/step)*step;
}
export function validateData(data) {
  if(!data||!Array.isArray(data.sources)||!Array.isArray(data.entries))throw new Error('Неверный формат данных.');
  const ids=new Set();
  for(const s of data.sources){if(typeof s.id!=='string'||ids.has(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>80||typeof s.active!=='boolean'||!/^#[0-9a-f]{6}$/i.test(s.color))throw new Error('Некорректный источник.');ids.add(s.id);}
  const keys=new Set();
  for(const e of data.entries){const key=e.sourceId+'|'+e.month;if(!ids.has(e.sourceId)||!validMonth(e.month)||!Number.isSafeInteger(e.amount)||e.amount<0||e.amount>999999999999||keys.has(key))throw new Error('Некорректная или повторная запись.');keys.add(key);}
  return data;
}
