import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAmount,monthRange,summarize,recentMedian,sortSources,niceCeiling,validateData} from '../model.js';
const sources=[{id:'a',name:'A',active:false,color:'#a78bfa',order:0},{id:'b',name:'B',active:true,color:'#5ed9bc',order:1}];
const data={sources,entries:[{month:'2025-01',sourceId:'a',amount:100000},{month:'2025-03',sourceId:'b',amount:0},{month:'2025-03',sourceId:'a',amount:200000}]};
test('money is exact cents, blank is missing, zero is recorded',()=>{assert.equal(parseAmount(' 20 613,15 ₽'),2061315);assert.equal(parseAmount('0'),0);assert.equal(parseAmount(''),null);for(const value of ['-1','1.234','1e3','NaN','a'])assert.throws(()=>parseAmount(value));});
test('month ranges cross years',()=>assert.deepEqual(monthRange('2024-12','2025-02'),['2024-12','2025-01','2025-02']));
test('missing months do not dilute observed average, inactive income included',()=>{const s=summarize(data,'2025-01','2025-03');assert.equal(s.total,300000);assert.equal(s.average,150000);assert.equal(s.months.length,3);assert.equal(s.months[1].count,0);assert.equal(s.activeSources,1);assert.equal(s.sources[0].id,'a');assert.equal(s.best.month,'2025-03');});
test('explicit zero counts as an observed month',()=>{const s=summarize(data,'2025-01','2025-03','b');assert.equal(s.observed.length,1);assert.equal(s.total,0);assert.equal(s.average,0);});
test('sorting status never drops inactive sources',()=>assert.deepEqual(sortSources(sources).map(s=>s.id),['b','a']));
test('ceiling follows scale with modest headroom',()=>{for(const max of [150,2000000,10000000,73000000])assert.ok(niceCeiling(max)>max&&niceCeiling(max)<max*1.4);});
test('duplicate source/month entries rejected',()=>assert.throws(()=>validateData({...data,entries:[...data.entries,data.entries[0]]})));

test('source averages include recorded zeros and do not decay after deactivation',()=>{
 const s=summarize(data,'2025-01','2026-09');
 assert.equal(s.sources.find(s=>s.id==='a').average,150000);
 assert.equal(s.sources.find(s=>s.id==='a').count,2);
 assert.equal(s.sources.find(s=>s.id==='b').average,0);
 assert.equal(summarize(data,'2025-03','2025-03').sources.find(s=>s.id==='a').average,200000);
});

test('six-month median uses monthly totals, missing months and zero have different meanings',()=>{
 const sample={sources,entries:[
  {month:'2026-02',sourceId:'a',amount:9000000},
  {month:'2026-03',sourceId:'a',amount:10000},
  {month:'2026-03',sourceId:'b',amount:30000},
  {month:'2026-04',sourceId:'b',amount:0},
  {month:'2026-06',sourceId:'a',amount:20000},
  {month:'2026-07',sourceId:'a',amount:90000},
  {month:'2026-09',sourceId:'a',amount:9000000},
  {month:'2026-10',sourceId:'a',amount:9000000}
 ]};
 assert.deepEqual(recentMedian(sample,'all','2026-09'),{median:30000,from:'2026-03',to:'2026-08',count:4});
 assert.equal(recentMedian(sample,['a'],'2026-09').median,20000);
 assert.equal(recentMedian(sample,['all','a'],'2026-09').median,30000);
 assert.equal(recentMedian(sample,[],'2026-09').median,null);
 assert.equal(recentMedian(sample,'all','2027-09').median,null);
 assert.deepEqual(recentMedian(sample,'b','2026-05'),{median:15000,from:'2025-11',to:'2026-04',count:2});
 assert.equal(recentMedian(sample,'b','2026-10').median,0);
});

test('median crosses a year boundary and rounds half cents consistently',()=>{
 const sample={sources,entries:[{month:'2025-12',sourceId:'a',amount:101},{month:'2026-01',sourceId:'a',amount:200}]};
 assert.deepEqual(recentMedian(sample,'all','2026-02'),{median:151,from:'2025-08',to:'2026-01',count:2});
});
