import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKUP_SCHEMA,BACKUP_VERSION,CSV_DELETE_MARKER,diffData,exportWideCsv,parseBackup,parseCsv,planWideCsvImport,verifyBackupChecksum} from '../data-transfer.js';
import {createHash} from 'node:crypto';

const data={
 sources:[{id:'salary',name:'Работа; основная',active:true,color:'#a78bfa',order:0},{id:'old',name:'Старый "проект"',active:false,color:'#5ed9bc',order:1}],
 entries:[{sourceId:'salary',month:'2025-01',amount:100050},{sourceId:'salary',month:'2025-03',amount:0},{sourceId:'old',month:'2025-02',amount:250000}],
 trash:[],revision:'a'.repeat(64)
};

test('wide CSV stores source metadata once and preserves gaps, zeroes, quotes and decimal cents',()=>{
 const csv=exportWideCsv(data),rows=parseCsv(csv);
 assert.deepEqual(rows[0],['ID','Источник','Статус','Цвет','Порядок','2025-01','2025-02','2025-03']);
 assert.deepEqual(rows[1],['salary','Работа; основная','Активный','#a78bfa','0','1000,5','','0']);
 assert.deepEqual(rows[2],['old','Старый "проект"','Неактивный','#5ed9bc','1','','2500','']);
 assert.equal(csv.match(/Активный/g).length,1);
});

test('safe merge changes only explicit cells and can explicitly delete an entry',()=>{
 const csv=[
  ['ID','Источник','Статус','Цвет','Порядок','2025-01','2025-02','2025-03'],
  ['salary','Работа','Активный','#a78bfa','0','1500','',''],
  ['old','Старый проект','Неактивный','#5ed9bc','1','',CSV_DELETE_MARKER,'']
 ].map(row=>row.map(value=>`"${value}"`).join(';')).join('\n');
 const plan=planWideCsvImport(data,csv);
 assert.equal(plan.data.entries.find(entry=>entry.sourceId==='salary'&&entry.month==='2025-01').amount,150000);
 assert.ok(plan.data.entries.some(entry=>entry.sourceId==='salary'&&entry.month==='2025-03'&&entry.amount===0));
 assert.ok(!plan.data.entries.some(entry=>entry.sourceId==='old'));
 assert.deepEqual(plan.changes,{sourcesAdded:0,sourcesChanged:2,entriesAdded:0,entriesChanged:1,entriesDeleted:1});
});

test('replace-period treats blank cells as intentional deletion only inside imported rows and months',()=>{
 const csv='ID;Источник;Статус;Цвет;Порядок;2025-01;2025-02\nsalary;Работа;Активный;#a78bfa;0;;900';
 const plan=planWideCsvImport(data,csv,{mode:'replace-period'});
 assert.ok(!plan.data.entries.some(entry=>entry.sourceId==='salary'&&entry.month==='2025-01'));
 assert.ok(plan.data.entries.some(entry=>entry.sourceId==='salary'&&entry.month==='2025-02'&&entry.amount===90000));
 assert.ok(plan.data.entries.some(entry=>entry.sourceId==='old'&&entry.month==='2025-02'));
 assert.ok(plan.data.entries.some(entry=>entry.sourceId==='salary'&&entry.month==='2025-03'));
});

test('CSV import rejects malformed metadata, duplicate names and invalid amounts',()=>{
 assert.throws(()=>planWideCsvImport(data,'Источник;2025-01\nA;1'),/обязательные|Ожидался/);
 assert.throws(()=>planWideCsvImport(data,'ID;Источник;Статус;Цвет;Порядок;2025-01\na;A;Активный;#a78bfa;0;1\nb;A;Активный;#5ed9bc;1;2'),/повторяется название/);
 assert.throws(()=>planWideCsvImport(data,'ID;Источник;Статус;Цвет;Порядок;2025-01\nsalary;Работа;Активный;#a78bfa;0;-1'),/Введите сумму/);
});

test('diff distinguishes additions, edits and deletions',()=>{
 const after={...data,sources:[...data.sources,{id:'new',name:'New',active:true,color:'#ffffff',order:2}],entries:[data.entries[0],{sourceId:'new',month:'2025-01',amount:1}]};
 assert.deepEqual(diffData(data,after),{sourcesAdded:1,sourcesChanged:0,entriesAdded:1,entriesChanged:0,entriesDeleted:2});
});

test('backup parser accepts only versioned Potok data and verifies its checksum',async()=>{
 const contents={sources:data.sources,entries:data.entries};
 const checksum=createHash('sha256').update(JSON.stringify([contents.sources,contents.entries])).digest('hex');
 const backup={schema:BACKUP_SCHEMA,version:BACKUP_VERSION,createdAt:Date.now(),checksum,data:contents};
 assert.deepEqual(parseBackup(JSON.stringify(backup)),backup);
 assert.deepEqual(await verifyBackupChecksum(backup),backup);
 await assert.rejects(verifyBackupChecksum({...backup,checksum:'a'.repeat(64)}),/Контрольная сумма/);
 assert.throws(()=>parseBackup('{}'),/не поддерживаемая/);
 assert.throws(()=>parseBackup(JSON.stringify({...backup,checksum:'bad'})),/метаданные/);
});
