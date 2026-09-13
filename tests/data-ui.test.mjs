import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MAX_IMPORT_BYTES,importSummary} from '../data-tools.js';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const tools=await readFile(new URL('../data-tools.js',import.meta.url),'utf8');
const api=await readFile(new URL('../api.js',import.meta.url),'utf8');

test('data tools expose editable CSV, exact JSON backup and checked import',()=>{
 for(const id of ['data-tools','export-csv','export-backup','create-drive-backup','setup-drive-backups','import-file','import-mode','import-preview','import-apply'])assert.match(html,new RegExp(`id="${id}"`));
 assert.doesNotMatch(html,/id="export-data"\s+hidden/);
 assert.match(html,/Безопасное объединение/);assert.match(html,/Заменить месяцы из файла/);
 assert.match(html,/пустые ячейки ничего не удаляют/);assert.match(html,/сервер создаст отдельную резервную копию/);
});

test('front end verifies backup checksum and previews CSV changes before enabling import',()=>{
 assert.match(app,/setupDataTools\(/);
 assert.match(tools,/verifyBackupChecksum\(backup\)/);
 assert.match(tools,/planWideCsvImport\(data,text/);
 assert.match(tools,/importPlan=null/);assert.match(tools,/import-apply'\)\.disabled=true/);
 assert.match(tools,/type:'restoreBackup'/);assert.match(tools,/type:'importData'/);
 assert.equal(MAX_IMPORT_BYTES,3*1024*1024);
 assert.match(tools,/file\.size>MAX_IMPORT_BYTES/);
 assert.equal(importSummary({sourcesAdded:1,sourcesChanged:2,entriesAdded:3,entriesChanged:4,entriesDeleted:5}),'Источники: +1, изменится 2. Суммы: +3, изменится 4, удалится 5.');
});

test('API keeps backup operations behind the authenticated request client',()=>{
 assert.match(api,/backup\(\)\{return this\.request\('backup'\);\}/);
 assert.match(api,/createBackup\(\)\{return this\.request\('createBackup'\);\}/);
 assert.match(api,/backupMaintenance\(\)\{return this\.request\('backupMaintenance'\);\}/);
});
