import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile,readdir} from 'node:fs/promises';
import {CUSTOM_THEME_DEFAULTS,THEME_ACCENTS,THEME_SETTINGS_KEY,normalizeThemeSettings} from '../theme.js';

const root=new URL('../',import.meta.url);
const [html,app,css,head,theme]=await Promise.all(['index.html','app.js','style.css','theme-head.js','theme.js'].map(file=>readFile(new URL(file,root),'utf8')));

test('Obsidian is the default and both configurable themes are exposed symmetrically',()=>{
 assert.match(html,/<html lang="ru" data-theme="obsidian">/);
 assert.match(theme,/storage\.getItem\(THEME_KEY\)\|\|'obsidian'/);
 assert.match(app,/setupTheme\(\)/);
 assert.deepEqual([...html.matchAll(/class="theme-select" data-theme="([^"]+)"/g)].map(match=>match[1]),['obsidian','quartz','violet','midnight','forest','light']);
 assert.equal((html.match(/data-theme-settings=/g)||[]).length,2);
 assert.equal((html.match(/data-glow aria-label=/g)||[]).length,2);
 assert.equal((html.match(/>По умолчанию<\/button>/g)||[]).length,2);
 assert.match(css,/:root\[data-theme=obsidian\][^{]*\{[^}]*--bg:#080808/);
 assert.match(css,/:root\[data-theme=quartz\]/);
});

test('custom accent and glow settings are validated and persisted locally',()=>{
 assert.equal(THEME_ACCENTS.length,12);
 assert.equal(new Set(THEME_ACCENTS).size,12);
 assert.equal(THEME_ACCENTS[0],'#fb7185');
 assert.equal(THEME_SETTINGS_KEY,'potok-theme-customization');
 assert.deepEqual(normalizeThemeSettings({obsidian:{accent:'#38bdf8',glow:0},quartz:{accent:'bad',glow:11}}),{
  obsidian:{accent:'#38bdf8',glow:0},quartz:CUSTOM_THEME_DEFAULTS.quartz
 });
 assert.match(theme,/storage\.setItem\(THEME_SETTINGS_KEY,JSON\.stringify\(customThemeSettings\)\)/);
 assert.match(css,/310px at 72% 0/);
});

test('compact controls keep their intended geometry on narrow screens',()=>{
 assert.match(css,/\.theme-options \.theme-settings-button\{[^}]*place-items:center[^}]*width:34px[^}]*height:34px[^}]*padding:0/);
 assert.match(css,/input\[type=range\]::\-webkit-slider-runnable-track\{[^}]*height:6px[^}]*border-radius:999px/);
 assert.match(css,/@media\(max-width:650px\)\{\.header-actions \.primary\{[^}]*width:44px[^}]*height:44px[^}]*gap:0/);
});

test('head branding synchronizes theme color, favicon, Apple icon, and manifest',()=>{
 assert.match(html,/manifest-src 'self'/);
 assert.match(head,/meta\[name="theme-color"\]/);
 assert.match(head,/data:image\/svg\+xml/);
 assert.match(head,/manifests\/\$\{key\}\.webmanifest\?v=1/);
 assert.match(head,/icons\/themes\/\$\{key\}-apple\.png\?v=1/);
 assert.match(theme,/potok-theme-change/);
});

test('every selectable theme and accent has stable install assets',async()=>{
 const files=(await readdir(new URL('manifests/',root))).filter(file=>file.endsWith('.webmanifest'));
 assert.equal(files.length,28);
 for(const file of files){
  const manifest=JSON.parse(await readFile(new URL(`manifests/${file}`,root),'utf8'));
  assert.equal(manifest.id,'../');
  assert.equal(manifest.start_url,'../');
  assert.equal(manifest.icons.length,3);
  for(const icon of manifest.icons)await access(new URL(`manifests/${icon.src.split('?')[0]}`,root));
  await access(new URL(`icons/themes/${file.replace('.webmanifest','')}-apple.png`,root));
 }
});
