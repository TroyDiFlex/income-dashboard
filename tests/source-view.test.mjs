import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceColorsHtml,sourceConfirmationCopy,trashHtml} from '../source-view.js';

test('source palette exposes selection without trusting arbitrary markup',()=>{
 const html=sourceColorsHtml(['#a78bfa','#5ed9bc'],'#5ed9bc');
 assert.match(html,/data-color="#a78bfa"[^>]*aria-pressed="false"/);
 assert.match(html,/class="color-option selected" data-color="#5ed9bc"[^>]*aria-pressed="true"/);
});

test('trash view sorts newest first, escapes metadata and disables expired restore',()=>{
 const now=Date.UTC(2026,8,14),html=trashHtml([
  {id:'old',name:'Old',color:'#a78bfa',active:false,deletedAt:now-40,expiresAt:now-1,entryCount:1,total:0},
  {id:'new',name:'<Новый>',color:'#5ed9bc',active:true,deletedAt:now-20,expiresAt:now+2*86400000,entryCount:3,total:125050}
 ],now);
 assert.ok(html.indexOf('&lt;Новый&gt;')<html.indexOf('Old'));
 assert.match(html,/Осталось дней: 2/);
 assert.match(html,/data-restore-source="old" disabled/);
 assert.match(html,/Записей: 1 · 0[^<]*₽/);
});

test('empty trash and destructive confirmation remain explicit',()=>{
 assert.match(trashHtml([]),/Корзина пуста/);
 assert.deepEqual(sourceConfirmationCopy('deleteSource'),{
  title:'Удалить источник навсегда?',
  description:'Источник и все его доходы за все годы будут удалены безвозвратно. Восстановить их не получится.',
  label:'Удалить навсегда',delay:3000,danger:true
 });
 assert.equal(sourceConfirmationCopy('restoreSource').delay,0);
 assert.throws(()=>sourceConfirmationCopy('unknown'),/Неизвестное действие/);
});
