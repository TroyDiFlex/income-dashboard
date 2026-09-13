import test from 'node:test';
import assert from 'node:assert/strict';
import {entriesTableHtml,entryInputValue,entryMonths,monthFieldsHtml,sourceOptionsHtml} from '../entries-view.js';

const data={sources:[
 {id:'active',name:'Работа & проекты',active:true,order:0,color:'#a78bfa'},
 {id:'old',name:'Архив',active:false,order:1,color:'#5ed9bc'}
],entries:[
 {sourceId:'active',month:'2025-12',amount:125050},
 {sourceId:'active',month:'2026-01',amount:0},
 {sourceId:'old',month:'2026-01',amount:50000}
]};

test('all-years table spans the recorded range and distinguishes zero from missing values',()=>{
 assert.deepEqual(entryMonths(data,'all','2026-02'),['2025-12','2026-01']);
 const html=entriesTableHtml(data,'all','2026-01');
 assert.match(html,/Работа &amp; проекты/);assert.match(html,/АКТИВНЫЕ/);assert.match(html,/НЕАКТИВНЫЕ/);
 assert.match(html,/data-cell-source="active" data-cell-month="2026-01"[^>]*>0<\/button>/);
 assert.match(html,/data-cell-source="old" data-cell-month="2025-12"[^>]*>—<\/button>/);
 assert.match(html,/class="current-col">Январь<br>2026/);
});

test('empty all-years table defaults to the current calendar year',()=>{
 assert.equal(entryMonths({sources:[],entries:[]},'all','2030-04').length,12);
 assert.deepEqual(entryMonths({sources:[],entries:[]},'all','2030-04').slice(0,2),['2030-01','2030-02']);
});

test('month editor and entry dialog preserve cents, zeroes and inactive labels',()=>{
 const html=monthFieldsHtml(data,'2026-01');
 assert.match(html,/value="0"/);assert.match(html,/month-source inactive/);assert.match(html,/Работа &amp; проекты/);
 assert.equal(entryInputValue(data,'active','2025-12'),'1250,5');
 assert.equal(entryInputValue(data,'active','2026-01'),'0');
 assert.equal(entryInputValue(data,'active','2026-02'),'');
 assert.match(sourceOptionsHtml(data),/Архив · неактивный/);
});

test('table totals preserve recorded zero while leaving missing months empty',()=>{
 const zeroData={sources:[data.sources[0]],entries:[{sourceId:'active',month:'2026-01',amount:0}]};
 const html=entriesTableHtml(zeroData,'2026','2026-02');
 const total=html.match(/<tr class="table-total">(.*?)<\/tr>/)[1];
 assert.match(total,/<td>0<\/td>/);
 assert.match(total,/<td>—<\/td>/);
});
