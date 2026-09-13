import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupSourceFilter,sourceSelectionLabel} from '../source-filter.js';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

function picker(){
 const nodes=new Map();let focused=null,renders=0,selected=['all'];
 const $=id=>{
  if(!nodes.has(id))nodes.set(id,{id,hidden:true,attributes:{},parentElement:{},listeners:{},
   setAttribute(key,value){this.attributes[key]=value;},focus(){focused=this.id;},
   addEventListener(type,listener){this.listeners[type]=listener;},contains(target){return target?.inside===true;}
  });
  return nodes.get(id);
 };
 const document={getElementById:$,querySelectorAll:()=>[],addEventListener(type,fn){this[type]=fn;}};
 const storage={value:null,getItem(){return this.value;},setItem(key,value){this.value=value;}};
 const sources=[{id:'a',name:'Работа',active:true,order:0,color:'#a78bfa'},{id:'b',name:'Архив',active:false,order:1,color:'#5ed9bc'}];
 const controller=setupSourceFilter({document,storage,getSources:()=>sources,getSelection:()=>selected,setSelection:value=>{selected=value;},onChange(options){assert.equal(options?.newSourcesOnly,true);renders++;}});
 const fire=(id,type,event={})=>$(id).listeners[type]?.(event);
 return {controller,$,fire,document,storage,selection:()=>selected,focused:()=>focused,renders:()=>renders};
}

test('picker uses labelled native checkboxes and an expandable styled button',()=>{
 assert.doesNotMatch(html,/<select id="source-filter"/);
 assert.match(html,/id="source-filter-trigger" aria-expanded="false" aria-controls="source-filter-panel"/);
 assert.match(html,/<input type="checkbox" id="source-toggle-all" aria-label="Выбрать всё">/);
 assert.match(html,/id="source-filter-options"[^>]*role="group" aria-labelledby="source-filter-title"/);
});
test('selection labels describe totals, subsets and empty selection',()=>{
 const sources=[{id:'a',name:'Работа'}];
 assert.equal(sourceSelectionLabel(['all'],sources),'Общий доход');
 assert.equal(sourceSelectionLabel(['a'],sources),'Работа');
 assert.equal(sourceSelectionLabel(['all','a'],sources),'Общий доход + 1');
 assert.equal(sourceSelectionLabel([],sources),'Источники не выбраны');
});
test('default selection is independent of the mixed select-all checkbox',()=>{
 const p=picker();p.controller.update();assert.equal(p.$('source-filter-label').textContent,'Общий доход');
 assert.equal(p.$('source-toggle-all').checked,false);assert.equal(p.$('source-toggle-all').indeterminate,true);
});
test('select all, clear all and select one update immediately without closing the panel',()=>{
 const p=picker();p.fire('source-filter-trigger','click');p.$('source-toggle-all').checked=true;p.fire('source-toggle-all','change');
 assert.deepEqual(p.selection(),['all','a','b']);assert.equal(p.$('source-toggle-all').indeterminate,false);assert.equal(p.$('source-toggle-all').attributes['aria-label'],'Снять выделение');
 p.$('source-toggle-all').checked=false;p.fire('source-toggle-all','change');assert.deepEqual(p.selection(),[]);assert.equal(p.$('source-filter-label').textContent,'Источники не выбраны');
 p.fire('source-filter-options','change',{target:{closest:()=>({value:'a',checked:true})}});
 assert.deepEqual(p.selection(),['a']);assert.equal(p.$('source-filter-label').textContent,'Работа');assert.equal(p.$('source-filter-panel').hidden,false);assert.equal(p.renders(),3);
});
test('aggregate plus a source is preserved; unchecking the aggregate leaves that source',()=>{
 const p=picker();p.fire('source-filter-options','change',{target:{closest:()=>({value:'a',checked:true})}});
 assert.deepEqual(p.selection(),['all','a']);assert.equal(p.$('source-filter-label').textContent,'Общий доход + 1');
 p.fire('source-filter-options','change',{target:{closest:()=>({value:'all',checked:false})}});assert.deepEqual(p.selection(),['a']);
});
test('label pointerdown can blur the trigger before native checkbox activation without closing the panel',()=>{
 const p=picker();p.fire('source-filter-trigger','click');p.document.pointerdown({target:{inside:true}});p.fire('source-filter','focusout',{relatedTarget:null});
 assert.equal(p.$('source-filter-panel').hidden,false);p.fire('source-filter-options','change',{target:{closest:()=>({value:'a',checked:true})}});
 assert.deepEqual(p.selection(),['all','a']);assert.equal(p.renders(),1);assert.equal(p.$('source-filter-panel').hidden,false);
});
test('master checkbox survives the same blur-before-click sequence',()=>{
 const p=picker();p.fire('source-filter-trigger','click');p.document.pointerdown({target:{inside:true}});p.fire('source-filter','focusout',{relatedTarget:null});
 assert.equal(p.$('source-filter-panel').hidden,false);p.$('source-toggle-all').checked=true;p.fire('source-toggle-all','change');
 assert.deepEqual(p.selection(),['all','a','b']);assert.equal(p.$('source-filter-panel').hidden,false);
});
test('keyboard opening focuses master checkbox; Escape closes and restores trigger focus',()=>{
 const p=picker();let prevented=0;p.fire('source-filter-trigger','keydown',{key:'ArrowDown',preventDefault(){prevented++;}});
 assert.equal(p.$('source-filter-panel').hidden,false);assert.equal(p.focused(),'source-toggle-all');
 p.fire('source-filter','keydown',{key:'Escape',preventDefault(){prevented++;}});assert.equal(p.$('source-filter-panel').hidden,true);assert.equal(p.focused(),'source-filter-trigger');
 assert.equal(p.$('source-filter-trigger').attributes['aria-expanded'],'false');assert.equal(prevented,2);
});
test('outside click and leaving focus close the picker; inside interaction keeps it open',()=>{
 const p=picker();p.fire('source-filter-trigger','click');p.document.pointerdown({target:{inside:true}});assert.equal(p.$('source-filter-panel').hidden,false);
 p.document.focusin({target:{inside:true}});assert.equal(p.$('source-filter-panel').hidden,false);p.document.pointerdown({target:{}});assert.equal(p.$('source-filter-panel').hidden,true);
 p.fire('source-filter-trigger','click');p.document.focusin({target:{}});assert.equal(p.$('source-filter-panel').hidden,true);
});
test('stored selection is de-duplicated and malformed storage falls back safely',()=>{
 const p=picker();p.storage.value='["all","a","a"]';assert.deepEqual(p.controller.restore(),['all','a']);p.storage.value='{broken';assert.deepEqual(p.controller.restore(),['all']);
});
