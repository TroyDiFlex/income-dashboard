import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); }
catch { sharp = require('../.local/node_modules/sharp'); }

// The README/favicon SVG is the source of truth for the desktop silhouette.
const root = new URL('../', import.meta.url);
const rounded = await readFile(new URL('icon.svg', root), 'utf8');
const square = rounded.replace(' rx="4"', '');
await mkdir(new URL('icons/', root), {recursive:true});

for (const size of [192, 512]) {
  await sharp(Buffer.from(rounded)).resize(size, size).png()
    .toFile(fileURLToPath(new URL(`icons/icon-${size}.png`, root)));
}

// Mobile platforms apply their own mask: give them an opaque, full-bleed asset.
for (const [size, name] of [[512, 'icon-maskable-512'], [180, 'apple-touch-icon']]) {
  await sharp(Buffer.from(square)).resize(size, size).flatten({background:'#fb7185'}).png()
    .toFile(fileURLToPath(new URL(`icons/${name}.png`, root)));
}

const accents = ['#fb7185','#f97316','#facc15','#4ade80','#2dd4bf','#38bdf8','#60a5fa','#818cf8','#a78bfa','#e879f9','#f472b6','#f5f5f4'];
const themes = [
  ['violet','#0c0b13',['#b39aff']], ['midnight','#0a111b',['#83bbff']],
  ['forest','#0b1413',['#9be5c3']], ['light','#f4f2f8',['#7954c0']],
  ['obsidian','#080808',accents], ['quartz','#fafafa',accents]
];
await mkdir(new URL('icons/themes/', root), {recursive:true});
await mkdir(new URL('manifests/', root), {recursive:true});
for (const [theme, background, palette] of themes) for (const accent of palette) {
  const key = `${theme}-${accent.slice(1)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="${accent}"/><path d="M4.8 12.4V5.8h6.9v6.6H9.4V7.7H7.1v4.7Z" fill="${background}"/></svg>`;
  const maskable = svg.replace(' rx="4"','');
  for (const size of [192,512]) await sharp(Buffer.from(svg)).resize(size,size).png().toFile(fileURLToPath(new URL(`icons/themes/${key}-${size}.png`,root)));
  await sharp(Buffer.from(maskable)).resize(512,512).flatten({background:accent}).png().toFile(fileURLToPath(new URL(`icons/themes/${key}-maskable.png`,root)));
  await sharp(Buffer.from(maskable)).resize(180,180).flatten({background:accent}).png().toFile(fileURLToPath(new URL(`icons/themes/${key}-apple.png`,root)));
  const manifest = {id:'../',name:'Поток',short_name:'Поток',description:'Личная аналитика доходов',lang:'ru',start_url:'../',scope:'../',display:'standalone',background_color:background,theme_color:background,icons:[
    {src:`../icons/themes/${key}-192.png?v=1`,sizes:'192x192',type:'image/png',purpose:'any'},
    {src:`../icons/themes/${key}-512.png?v=1`,sizes:'512x512',type:'image/png',purpose:'any'},
    {src:`../icons/themes/${key}-maskable.png?v=1`,sizes:'512x512',type:'image/png',purpose:'maskable'}
  ]};
  await writeFile(new URL(`manifests/${key}.webmanifest`,root),JSON.stringify(manifest,null,2)+'\n');
}
console.log('Built default icons plus theme- and accent-aware installation assets.');
