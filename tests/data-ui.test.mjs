import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const api=await readFile(new URL('../api.js',import.meta.url),'utf8');

test('data tools expose editable CSV, exact JSON backup and checked import',()=>{
 for(const id of ['data-tools','export-csv','export-backup','create-drive-backup','import-file','import-mode','import-preview','import-apply'])assert.match(html,new RegExp(`id="${id}"`));
 assert.doesNotMatch(html,/id="export-data"\s+hidden/);
 assert.match(html,/Безопасное объединение/);assert.match(html,/Заменить месяцы из файла/);
 assert.match(html,/пустые ячейки ничего не удаляют/);assert.match(html,/сервер создаст отдельную резервную копию/);
});

test('front end verifies backup checksum and previews CSV changes before enabling import',()=>{
 assert.match(app,/verifyBackupChecksum\(backup\)/);
 assert.match(app,/planWideCsvImport\(data,importFileText/);
 assert.match(app,/importPlan=null/);assert.match(app,/import-apply'\)\.disabled=true/);
 assert.match(app,/type:'restoreBackup'/);assert.match(app,/type:'importData'/);
});

test('API keeps backup operations behind the authenticated request client',()=>{
 assert.match(api,/backup\(\)\{return this\.request\('backup'\);\}/);
 assert.match(api,/createBackup\(\)\{return this\.request\('createBackup'\);\}/);
});
