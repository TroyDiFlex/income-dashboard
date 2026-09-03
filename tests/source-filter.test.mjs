import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {sortSources} from '../model.js';

const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const pickerCode=app.slice(app.indexOf('function sourceSelectionLabel()'),app.indexOf("document.querySelectorAll('[data-chart]')"));
function picker(){
 const nodes=new Map();let focused=null,renders=0;
 const $=id=>{
  if(!nodes.has(id))nodes.set(id,{id,hidden:true,attributes:{},parentElement:{},listeners:{},
   setAttribute(key,value){this.attributes[key]=value;},focus(){focused=this.id;},
   addEventListener(type,listener){this.listeners[type]=listener;},contains(target){return target?.inside===true;}
  });
  return nodes.get(id);
 };
 const document={querySelectorAll:()=>[],addEventListener(type,fn){this[type]=fn;}};
 const data={sources:[{id:'a',name:'Работа',active:true,order:0,color:'#a78bfa'},{id:'b',name:'Архив',active:false,order:1,color:'#5ed9bc'}]};
 const ctx=vm.createContext({$,document,data,sourceFilter:['all'],sortSources,esc:String,renderOverview(){renders++;}});
 vm.runInContext(pickerCode,ctx);
 const fire=(id,type,event={})=>$(id).listeners[type](event);
 return {ctx,$,fire,document,selection:()=>Array.from(ctx.sourceFilter),focused:()=>focused,renders:()=>renders};
}

test('picker uses labelled native checkboxes and an expandable styled button',()=>{
 assert.doesNotMatch(html,/<select id="source-filter"/);
 assert.match(html,/id="source-filter-trigger" aria-expanded="false" aria-controls="source-filter-panel"/);
 assert.match(html,/<input type="checkbox" id="source-toggle-all" aria-label="Выбрать всё">/);
 assert.match(html,/id="source-filter-options"[^>]*role="group" aria-labelledby="source-filter-title"/);
});
test('default selection is independent of the mixed select-all checkbox',()=>{
 const p=picker();p.ctx.updateSourceFilter();
 assert.equal(p.$('source-filter-label').textContent,'Все источники');
 assert.equal(p.$('source-toggle-all').checked,false);assert.equal(p.$('source-toggle-all').indeterminate,true);
});
test('select all, clear all and select one update immediately without closing the panel',()=>{
 const p=picker();p.fire('source-filter-trigger','click');
 p.$('source-toggle-all').checked=true;p.fire('source-toggle-all','change');
 assert.deepEqual(p.selection(),['all','a','b']);assert.equal(p.$('source-toggle-all').indeterminate,false);
 assert.equal(p.$('source-toggle-all').attributes['aria-label'],'Снять выделение');
 p.$('source-toggle-all').checked=false;p.fire('source-toggle-all','change');
 assert.deepEqual(p.selection(),[]);assert.equal(p.$('source-filter-label').textContent,'Источники не выбраны');
 p.fire('source-filter-options','change',{target:{closest:()=>({value:'a',checked:true})}});
 assert.deepEqual(p.selection(),['a']);assert.equal(p.$('source-filter-label').textContent,'Работа');
 assert.equal(p.$('source-filter-panel').hidden,false);assert.equal(p.renders(),3);
});
test('aggregate plus a source is preserved; unchecking the aggregate leaves that source',()=>{
 const p=picker();
 p.fire('source-filter-options','change',{target:{closest:()=>({value:'a',checked:true})}});
 assert.deepEqual(p.selection(),['all','a']);assert.equal(p.$('source-filter-label').textContent,'Все источники + 1');
 p.fire('source-filter-options','change',{target:{closest:()=>({value:'all',checked:false})}});
 assert.deepEqual(p.selection(),['a']);
});
test('keyboard opening focuses master checkbox; Escape closes and restores trigger focus',()=>{
 const p=picker();let prevented=0;
 p.fire('source-filter-trigger','keydown',{key:'ArrowDown',preventDefault(){prevented++;}});
 assert.equal(p.$('source-filter-panel').hidden,false);assert.equal(p.focused(),'source-toggle-all');
 p.fire('source-filter','keydown',{key:'Escape',preventDefault(){prevented++;}});
 assert.equal(p.$('source-filter-panel').hidden,true);assert.equal(p.focused(),'source-filter-trigger');
 assert.equal(p.$('source-filter-trigger').attributes['aria-expanded'],'false');assert.equal(prevented,2);
});
test('outside click and leaving focus close the picker; inside interaction keeps it open',()=>{
 const p=picker();p.fire('source-filter-trigger','click');
 p.document.pointerdown({target:{inside:true}});assert.equal(p.$('source-filter-panel').hidden,false);
 p.fire('source-filter','focusout',{currentTarget:p.$('source-filter'),relatedTarget:{inside:true}});
 assert.equal(p.$('source-filter-panel').hidden,false);
 p.document.pointerdown({target:{}});assert.equal(p.$('source-filter-panel').hidden,true);
 p.fire('source-filter-trigger','click');p.fire('source-filter','focusout',{currentTarget:p.$('source-filter'),relatedTarget:null});
 assert.equal(p.$('source-filter-panel').hidden,true);
});
