import {readFile, mkdir} from 'node:fs/promises';
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
  await sharp(Buffer.from(square)).resize(size, size).flatten({background:'#b39aff'}).png()
    .toFile(fileURLToPath(new URL(`icons/${name}.png`, root)));
}
console.log('Built rounded desktop icons and separate opaque mobile icons.');
