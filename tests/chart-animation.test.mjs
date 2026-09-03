import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {incomeChart,chartGeometry,lineRevealStarts,LINE_REVEAL_MS} from '../chart.js';
import {monthLabel} from '../model.js';

const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const renderCode=app.slice(app.indexOf('let chartModel=null;'),app.indexOf('function hideChartTooltip()'));
const data={sources:[
 {id:'a',name:'Работа',color:'#a78bfa',active:true,order:0},
 {id:'b',name:'Проекты',color:'#5ed9bc',active:true,order:1}
],entries:[
 {month:'2026-01',sourceId:'a',amount:10000},
 {month:'2026-02',sourceId:'a',amount:20000},
 {month:'2026-01',sourceId:'b',amount:30000},
 {month:'2026-04',sourceId:'b',amount:50000}
]};

function chart(type='line'){
 let now=0;
 const nodes=new Map(),$=id=>{
  if(!nodes.has(id))nodes.set(id,{innerHTML:'',clientWidth:900,clientHeight:272,setAttribute(){}});
  return nodes.get(id);
 };
 const ctx=vm.createContext({$,data,view:'overview',chartType:type,sourceFilter:['all'],chartSelection:-1,
  incomeChart,chartGeometry,lineRevealStarts,monthLabel,esc:String,
  sourceSelectionLabel:()=>'',periodBounds:()=>['2026-01','2026-04'],performance:{now:()=>now}
 });
 vm.runInContext(renderCode,ctx);
 const render=options=>ctx.renderChart(options);
 render();
 return {ctx,render,setTime(value){now=value;},svg:()=>$('chart').innerHTML,
  select(ids){ctx.sourceFilter=ids;render({newSourcesOnly:true});},
  revealing(){const model=vm.runInContext('chartModel',ctx);return model?Array.from(model.model.lines)
   .filter((_,i)=>$('chart').innerHTML.includes(`id="chart-reveal-clip-${i}"`)).map(s=>s.id):[];}
 };
}

for(const type of ['line','smooth'])test(`${type}: only added sources reveal; removal and index changes do not replay existing lines`,()=>{
 const c=chart(type);
 assert.deepEqual(c.revealing(),['all']);
 const totalPath=c.svg().match(/<path class="data-line" data-series="0"[^>]* d="([^"]+)"/)[1];
 c.setTime(LINE_REVEAL_MS+100);c.select(['all','a']);
 assert.deepEqual(c.revealing(),['a']);
 assert.equal(c.svg().match(/<path class="data-line" data-series="0"[^>]* d="([^"]+)"/)[1],totalPath);
 c.setTime(2*LINE_REVEAL_MS+200);c.select(['a']);
 assert.deepEqual(c.revealing(),[]);
 assert.match(c.svg(),/class="data-line" data-series="0"/);
 c.select(['all','a']);assert.deepEqual(c.revealing(),['all']);
});

test('rapid additions continue earlier reveals at their original progress',()=>{
 const c=chart();
 c.setTime(400);c.select(['all','a']);
 assert.deepEqual(c.revealing(),['all','a']);
 assert.match(c.svg(),/id="chart-reveal-clip-0"[^>]*><rect[^>]*--line-delay:-400ms/);
 c.setTime(700);c.select(['all','a','b']);
 assert.deepEqual(c.revealing(),['all','a','b']);
 for(const [i,delay] of [[0,-700],[1,-300],[2,0]]){
  assert.match(c.svg(),new RegExp(`id="chart-reveal-clip-${i}"[^>]*><rect[^>]*--line-delay:${delay}ms`));
 }
 // The new source's disconnected strokes, isolated points and fills use one clip.
 assert.equal(c.svg().split('clip-path="url(#chart-reveal-clip-2)"').length-1,2);
 c.setTime(2400);c.select(['all','b']);assert.deepEqual(c.revealing(),[]);
 c.select(['all','a','b']);assert.deepEqual(c.revealing(),['a']);
});

test('clearing selection resets reveals; resize skips them; normal redraws still animate all lines',()=>{
 const c=chart();
 c.setTime(2000);c.select([]);assert.deepEqual(c.revealing(),[]);
 c.select(['all','a']);assert.deepEqual(c.revealing(),['all','a']);
 c.render({animate:false});assert.deepEqual(c.revealing(),[]);
 assert.doesNotMatch(c.svg(),/class="chart-enter"/);
 c.select(['all','a','b']);assert.deepEqual(c.revealing(),['b']);
 c.render();assert.deepEqual(c.revealing(),['all','a','b']);
});

test('bar filters keep their existing growth animation and never add line reveal clips',()=>{
 const c=chart('bars');c.setTime(2000);c.select(['all','a']);
 assert.match(c.svg(),/class="chart-enter"/);
 assert.match(c.svg(),/class="bar-stack"/);
 assert.doesNotMatch(c.svg(),/id="chart-reveal-clip-/);
});
