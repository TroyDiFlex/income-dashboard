import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {COLORS,validateData} from '../model.js';
import {harness} from './server-harness.mjs';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('only the month overview option is hidden; monthly data entry is retained',async()=>{
 const periods=[...html.matchAll(/<button\b([^>]*\bdata-period="([^"]+)"[^>]*)>/g)];
 assert.deepEqual(periods.filter(([,attributes])=>! /\bhidden\b/.test(attributes)).map(([, ,period])=>period),['all','year','custom']);
 assert.ok(periods.some(([,attributes,period])=>period==='month'&&/\bhidden\b/.test(attributes)));
 assert.match(html,/<button data-mode="month">По месяцу<\/button>/);
 const css=await readFile(new URL('../style.css',import.meta.url),'utf8');
 assert.match(css,/\[hidden\]\{display:none!important\}/);
});

test('source palette preserves every existing color and adds five distinct valid colors',()=>{
 assert.deepEqual(COLORS.slice(0,8),['#a78bfa','#5ed9bc','#f5bd72','#ec88bf','#79b8ff','#d3d96c','#ff9292','#b5b0ce']);
 assert.equal(COLORS.length,13);
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

test('favicon is cache-versioned and uses a filled pixel-aligned mark in the interface colors',async()=>{
 assert.match(html,/<link rel="icon" href="icon\.svg\?v=2" type="image\/svg\+xml" sizes="any">/);
 const icon=await readFile(new URL('../icon.svg',import.meta.url),'utf8');
 assert.match(icon,/viewBox="0 0 16 16"/);
 assert.match(icon,/fill="#b39aff"/);
 assert.match(icon,/fill="#0c0b13"/);
 assert.doesNotMatch(icon,/\bstroke[=-]/);
 assert.equal((icon.match(/<path\b/g)||[]).length,1);
});
