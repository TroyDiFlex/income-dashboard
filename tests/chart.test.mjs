import test from 'node:test';
import assert from 'node:assert/strict';
import {incomeChart,chartGeometry} from '../chart.js';
import {summarize} from '../model.js';

const data={sources:[
 {id:'a',name:'Работа',color:'#a78bfa',active:true,order:0},
 {id:'b',name:'Проекты',color:'#5ed9bc',active:true,order:1},
 {id:'c',name:'Архив',color:'#f5bd72',active:false,order:2}
],entries:[
 {month:'2026-01',sourceId:'a',amount:10000},
 {month:'2026-01',sourceId:'b',amount:30000},
 {month:'2026-01',sourceId:'c',amount:60000},
 {month:'2026-02',sourceId:'a',amount:0},
 {month:'2026-02',sourceId:'c',amount:5000},
 {month:'2026-04',sourceId:'a',amount:20000},
 {month:'2026-04',sourceId:'b',amount:80000}
]};
const model=(selection,from='2026-01',to='2026-04')=>incomeChart(data,from,to,selection);

test('default is one aggregate line and one aggregate bar series',()=>{
 const m=model();assert.deepEqual(m.lines.map(s=>s.id),['all']);
 assert.equal(m.bars.length,1);assert.equal(m.bars[0].color,'var(--accent)');
 assert.equal(m.summary.total,205000);
});
test('all plus one source adds a colored line and a non-overlapping bar remainder',()=>{
 const m=model(['all','a']);assert.deepEqual(m.lines.map(s=>s.id),['all','a']);
 assert.equal(m.lines[1].color,data.sources[0].color);
 assert.deepEqual(m.bars.map(s=>s.months[0].total),[10000,90000]);
 assert.equal(m.summary.total,205000);assert.equal(m.summary.recordCount,7);
});
test('select everything gives four lines but only three bar contributions',()=>{
 const m=model(['all','a','b','c']);
 assert.deepEqual(m.lines.map(s=>s.id),['all','a','b','c']);
 assert.deepEqual(m.bars.map(s=>s.id),['a','b','c']);
 assert.deepEqual(m.bars.map(s=>s.months[0].total),[10000,30000,60000]);
});
test('subsets without all filter totals and never show the aggregate line',()=>{
 const m=model(['b','a']);assert.equal(m.summary.total,140000);
 assert.deepEqual(m.lines.map(s=>s.id),['a','b']);assert.deepEqual(m.bars.map(s=>s.id),['a','b']);
 assert.equal(m.summary.observed.length,3);
});
test('empty selection is genuinely empty; duplicate choices cannot multiply income',()=>{
 const m=model([]);assert.equal(m.summary.total,0);assert.equal(m.summary.observed.length,0);
 assert.deepEqual(m.lines,[]);assert.deepEqual(m.bars,[]);
 assert.equal(model(['a','a']).summary.total,30000);
 assert.equal(summarize(data,'','',['all','a','all']).total,205000);
});
test('all sixteen checkbox combinations conserve every monthly stacked total',()=>{
 const ids=['all','a','b','c'];
 for(let mask=0;mask<16;mask++){
  const m=model(ids.filter((_,i)=>mask&(1<<i)));
  m.summary.months.forEach((month,i)=>assert.equal(m.bars.reduce((sum,series)=>sum+series.months[i].total,0),month.total));
 }
});
test('period bounds, archived sources, explicit zero and missing months survive',()=>{
 const m=model(['all','a','b','c'],'2026-02','2026-03');
 assert.equal(m.summary.total,5000);assert.equal(m.lines[1].months[0].count,1);
 assert.equal(m.lines[1].months[0].total,0);assert.equal(m.lines[2].months[0].count,0);
 assert.equal(m.lines[3].months[0].total,5000);assert.equal(m.summary.months[1].count,0);
});
test('each line has its own gradient, color, hover dot and independent missing-data gaps',()=>{
 const {svg}=chartGeometry(model(['all','a','b','c']),'smooth',900,272);
 assert.equal((svg.match(/<linearGradient /g)||[]).length,4);
 assert.equal((svg.match(/class="chart-point hover-dot"/g)||[]).length,4);
 for(const source of data.sources)assert.ok(svg.includes(`--series-color:${source.color}`));
 // b is absent in February and March: two isolated points, not an invented zero or bridge.
 const bPaths=[...svg.matchAll(/<path class="data-line" data-series="2"[^>]* d="([^"]+)"/g)];
 assert.equal(bPaths.length,2);assert.ok(bPaths.every(([,d])=>!/[CL]/.test(d)));
 assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
});
test('smooth and straight lines share colors but use different path interpolation',()=>{
 const m=model(['all','a']);
 assert.match(chartGeometry(m,'smooth',900,272).svg,/ C /);
 const straight=chartGeometry(m,'line',900,272).svg;
 assert.doesNotMatch(straight,/ C /);assert.match(straight,/ L /);
});
test('stacked rectangle heights are proportional, with one rounded outer boundary',()=>{
 const g=chartGeometry(model(['all','a','b','c']),'bars',900,272);
 const first=g.svg.match(/<g class="bar-stack"[^>]*>(.*?)<\/g>/)[1];
 const heights=[...first.matchAll(/height="([^"]+)"/g)].map(([,h])=>+h);
 assert.equal(heights.length,3);assert.ok(Math.abs(heights[1]/heights[0]-3)<1e-10);
 assert.ok(Math.abs(heights[2]/heights[0]-6)<1e-10);
 assert.ok(Math.abs(heights.reduce((a,b)=>a+b,0)-(g.y(0)-g.y(100000)))<1e-10);
 assert.doesNotMatch(first,/ rx=/);assert.match(g.svg,/<clipPath id="bar-clip-0">/);
 assert.doesNotMatch(g.svg,/bar-clip-2/);assert.doesNotMatch(g.svg,/class="data-line"/);
});
test('zero-only source has a visible mark and never becomes a missing month',()=>{
 const m=model(['a'],'2026-02','2026-02');
 for(const type of ['smooth','line','bars']){
  const {svg}=chartGeometry(m,type,300,238);
  assert.doesNotMatch(svg,/NaN|Infinity/);
  assert.match(svg,type==='bars'?/height="2"/:/class="chart-point"/);
 }
});
test('line scale follows the visible individual peaks, not their unshown sum',()=>{
 const m=model(['a','b','c']);
 const line=chartGeometry(m,'line',900,272),bar=chartGeometry(m,'bars',900,272);
 assert.ok(line.y(80000)<bar.y(80000));
});
