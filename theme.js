export const THEME_KEY='potok-theme';
export const THEME_SETTINGS_KEY='potok-theme-customization';
export const THEMES=['violet','midnight','forest','light','obsidian','quartz'];
export const THEME_ACCENTS=['#fb7185','#f97316','#facc15','#4ade80','#2dd4bf','#38bdf8','#60a5fa','#818cf8','#a78bfa','#e879f9','#f472b6','#f5f5f4'];
export const CUSTOM_THEME_DEFAULTS={obsidian:{accent:'#fb7185',glow:6},quartz:{accent:'#fb7185',glow:6}};

export function normalizeThemeSettings(saved={}){
 return Object.fromEntries(Object.entries(CUSTOM_THEME_DEFAULTS).map(([name,fallback])=>{
  const value=saved?.[name]||{};
  return [name,{
   accent:THEME_ACCENTS.includes(value.accent)?value.accent:fallback.accent,
   glow:Number.isInteger(value.glow)&&value.glow>=0&&value.glow<=10?value.glow:fallback.glow
  }];
 }));
}

export function readThemeSettings(storage){
 let saved={};
 try{saved=JSON.parse(storage.getItem(THEME_SETTINGS_KEY))||{};}catch{}
 return normalizeThemeSettings(saved);
}

export function setupTheme({document=globalThis.document,window=globalThis.window,storage=globalThis.localStorage}={}){
 const $=id=>document.getElementById(id);
 let customThemeSettings=readThemeSettings(storage);
 const themeRgb=hex=>[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)).join(' ');

 function renderControls(){
  document.querySelectorAll('[data-custom-theme]').forEach(card=>{
   const name=card.dataset.customTheme,settings=customThemeSettings[name],rgb=themeRgb(settings.accent);
   card.style.setProperty('--preview-accent',settings.accent);
   card.style.setProperty('--preview-glow',`rgb(${rgb} / ${settings.glow*.012})`);
   const customizer=card.querySelector('[data-customizer]'),palette=customizer.querySelector('.theme-accent-options');
   customizer.style.setProperty('--glow-progress',`${settings.glow*10}%`);
   if(!palette.children.length)palette.innerHTML=THEME_ACCENTS.map(color=>`<button type="button" class="theme-accent" data-accent="${color}" style="--choice:${color}" aria-label="Акцент ${color}" title="${color}"></button>`).join('');
   customizer.querySelector('[data-accent-value]').textContent=settings.accent.toUpperCase();
   customizer.querySelector('[data-glow]').value=settings.glow;
   customizer.querySelector('[data-glow-value]').value=settings.glow;
   palette.querySelectorAll('[data-accent]').forEach(button=>{
    const selected=button.dataset.accent===settings.accent;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',String(selected));
   });
  });
 }

 function applyVariables(value){
  const root=document.documentElement;
  ['--accent','--accent-strong','--accent-soft','--glow'].forEach(name=>root.style.removeProperty(name));
  if(!CUSTOM_THEME_DEFAULTS[value])return;
  const settings=customThemeSettings[value],rgb=themeRgb(settings.accent);
  root.style.setProperty('--accent',settings.accent);
  root.style.setProperty('--accent-strong',settings.accent);
  root.style.setProperty('--accent-soft',`rgb(${rgb} / .12)`);
  root.style.setProperty('--glow',`rgb(${rgb} / ${settings.glow*.012})`);
 }

 function select(value,{save=true}={}){
  if(!THEMES.includes(value))value='obsidian';
  document.documentElement.dataset.theme=value;
  applyVariables(value);
  if(save)try{storage.setItem(THEME_KEY,value);}catch{}
  document.querySelectorAll('.theme-select').forEach(button=>button.closest('.theme-card').classList.toggle('selected',button.dataset.theme===value));
  renderControls();
  const styles=window.getComputedStyle(document.documentElement);
  window.dispatchEvent(new window.CustomEvent('potok-theme-change',{detail:{theme:value,accent:styles.getPropertyValue('--accent').trim(),background:styles.getPropertyValue('--bg').trim()}}));
 }

 function saveSettings(){try{storage.setItem(THEME_SETTINGS_KEY,JSON.stringify(customThemeSettings));}catch{}}
 function updateSetting(name,change){
  if(!CUSTOM_THEME_DEFAULTS[name])return;
  customThemeSettings=normalizeThemeSettings({...customThemeSettings,[name]:{...customThemeSettings[name],...change}});
  saveSettings();renderControls();
  if(document.documentElement.dataset.theme===name)select(name);
 }
 function closeCustomizers(except=''){
  document.querySelectorAll('[data-customizer]').forEach(panel=>{
   const keep=panel.dataset.customizer===except;
   panel.hidden=!keep;
   document.querySelector(`[data-theme-settings="${panel.dataset.customizer}"]`)?.setAttribute('aria-expanded',String(keep));
  });
 }

 try{select(storage.getItem(THEME_KEY)||'obsidian');}catch{select('obsidian',{save:false});}
 $('theme-open').addEventListener('click',()=>{$('theme-dialog').showModal();closeCustomizers();});
 document.querySelectorAll('.theme-select').forEach(button=>button.addEventListener('click',()=>{select(button.dataset.theme);closeCustomizers();}));
 document.querySelectorAll('[data-theme-settings]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();const name=button.dataset.themeSettings;closeCustomizers(button.getAttribute('aria-expanded')==='true'?'':name);}));
 document.querySelectorAll('[data-customizer]').forEach(panel=>{
  panel.addEventListener('click',event=>event.stopPropagation());
  panel.querySelector('.theme-accent-options').addEventListener('click',event=>{const button=event.target.closest('[data-accent]');if(button)updateSetting(panel.dataset.customizer,{accent:button.dataset.accent});});
  panel.querySelector('[data-glow]').addEventListener('input',event=>updateSetting(panel.dataset.customizer,{glow:Number(event.target.value)}));
  panel.querySelector('.theme-reset').addEventListener('click',()=>updateSetting(panel.dataset.customizer,{...CUSTOM_THEME_DEFAULTS[panel.dataset.customizer]}));
 });
 $('theme-dialog').addEventListener('click',event=>{if(!event.target.closest('.custom-theme-card'))closeCustomizers();});
 $('theme-dialog').addEventListener('close',()=>closeCustomizers());

 return {select,updateSetting,closeCustomizers,get settings(){return structuredClone(customThemeSettings);}};
}
