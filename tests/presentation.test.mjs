import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {COLORS,validateData} from '../model.js';
import {harness} from './server-harness.mjs';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('chart controls start with the selected linear chart, then bars and smooth',async()=>{
 const buttons=[...html.matchAll(/<button\b([^>]*\bdata-chart="([^"]+)"[^>]*)>/g)];
 assert.deepEqual(buttons.map(([, ,type])=>type),['line','bars','smooth']);
 assert.deepEqual(buttons.filter(([,attributes])=>/class="selected"/.test(attributes)).map(([, ,type])=>type),['line']);
 for(const [,attributes,type] of buttons)assert.ok(attributes.includes(`aria-pressed="${type==='line'}"`));
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/\bchartType='line'/);
});

test('overview defaults to 24 months and keeps explicit long-range choices',async()=>{
 const periods=[...html.matchAll(/<button\b([^>]*\bdata-period="([^"]+)"[^>]*)>/g)];
 assert.deepEqual(periods.map(([, ,period])=>period),['12','24','36','all','year','custom']);
 assert.deepEqual(periods.filter(([,attributes])=>/class="selected"/.test(attributes)).map(([, ,period])=>period),['24']);
 assert.ok(!periods.some(([, ,period])=>period==='month'));
 assert.match(html,/<button data-mode="month">По месяцу<\/button>/);
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');assert.match(app,/period='24'/);assert.match(app,/shiftMonth\(end,1-Number\(period\)\)/);
 const css=await readFile(new URL('../style.css',import.meta.url),'utf8');
 assert.match(css,/\[hidden\]\{display:none!important\}/);
});

test('overview replaces the duplicated total card with longitudinal comparisons',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 for(const label of ['Последний месяц','К предыдущему','Год к году','Среднее за 6 мес.','Среднее за 12 мес.','Лучший год'])assert.match(app,new RegExp(label));
 assert.doesNotMatch(app,/\['Общий доход',money\(s\.total\)/);
 assert.match(app,/incomeInsights\(data,from,to,sourceFilter\)/);
});

test('chart exposes the selected monthly values as an accessible table',async()=>{
 assert.match(html,/<details class="chart-data">/);
 assert.match(html,/<div id="chart-data-table" class="chart-data-table"><\/div>/);
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/<caption>Доходы по месяцам за выбранный период<\/caption>/);
 assert.match(app,/<th scope="col">Месяц<\/th>/);
 assert.match(app,/<th scope="row">\$\{monthLabel\(month\.month\)\}<\/th>/);
});

test('editable forms warn before unsaved values are discarded',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/const dirtyForms=new Set\(\)/);
 assert.match(app,/window\.confirm\('Есть несохранённые изменения\. Закрыть без сохранения\?'\)/);
 assert.match(app,/window\.addEventListener\('beforeunload',e=>\{if\(busy\|\|dirtyForms\.size\)/);
 assert.match(app,/dirtyForms\.delete\(form\);form\.closest\('dialog'\)\?\.close\(\)/);
});

test('native select menus keep readable theme colors',async()=>{
 const css=await readFile(new URL('../style.css',import.meta.url),'utf8');
 assert.match(css,/select option\{color:var\(--text\);background:var\(--panel-solid\)\}/);
});

test('source palette preserves every existing color and offers 22 distinct valid colors',()=>{
 assert.deepEqual(COLORS.slice(0,13),['#a78bfa','#5ed9bc','#f5bd72','#ec88bf','#79b8ff','#d3d96c','#ff9292','#b5b0ce','#68c8d9','#8f9bea','#d99caa','#d99b7c','#94c987']);
 assert.deepEqual(COLORS.slice(13),['#ef5b62','#f29a45','#f1cd4f','#4fc773','#267f92','#3d78cf','#7b5aa6','#a94750','#4b8f61']);
 assert.equal(COLORS.length,22);
 assert.equal(new Set(COLORS).size,COLORS.length);
 for(const color of COLORS){
  assert.match(color,/^#[0-9a-f]{6}$/);
  assert.doesNotThrow(()=>validateData({sources:[{id:'sample',name:'Sample',active:true,color,order:0}],entries:[]}));
 }
});

test('all palette colors round-trip through the existing server without a backend update',async()=>{
 const h=await harness(),login=h.request({action:'login',proof:h.proof}).result;
 let revision=login.data.revision;
 for(const color of COLORS){
  const saved=h.request({action:'mutate',token:login.token,revision,operation:{type:'setSource',source:{id:'sample',name:'Sample',active:true,color,order:0}}});
  assert.equal(saved.ok,true);
  assert.equal(saved.result.sources[0].color,color);
  revision=saved.result.revision;
 }
 assert.equal(h.request({action:'read',token:login.token}).result.sources[0].color,COLORS.at(-1));
});

test('favicon is cache-versioned and matches the narrower interface mark proportions',async()=>{
 assert.match(html,/<link id="site-icon" rel="icon" href="icon\.svg\?v=4" type="image\/svg\+xml" sizes="any">/);
 const icon=await readFile(new URL('../icon.svg',import.meta.url),'utf8');
 assert.match(icon,/viewBox="0 0 16 16"/);
 assert.match(icon,/fill="#fb7185"/);
 assert.match(icon,/fill="#080808"/);
 // Match the displayed brand's narrow glyph, thicker stems and lower placement.
 assert.match(icon,/d="M4\.8 12\.4V5\.8h6\.9v6\.6H9\.4V7\.7H7\.1v4\.7Z"/);
 assert.doesNotMatch(icon,/\bstroke[=-]/);
 assert.equal((icon.match(/<path\b/g)||[]).length,1);
});
