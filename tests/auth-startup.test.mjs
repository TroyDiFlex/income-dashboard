import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const [html,app]=await Promise.all(['index.html','app.js'].map(file=>readFile(new URL(file,root),'utf8')));

test('the login form cannot flash before saved-session detection',()=>{
 assert.match(html,/<div id="session-status">/);
 assert.match(html,/<form id="login-form" hidden>/);
 assert.match(html,/Проверяем сохранённый вход…/);
});

test('startup restores a saved session and otherwise reveals login',()=>{
 assert.match(app,/if\(!CONFIG\.apiUrl\)showLogin\(/);
 assert.match(app,/else if\(api\.token\)restoreSession\(\);\s*else showLogin\(\);/);
});
