import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));

// Decode non-interlaced 8-bit RGB/RGBA PNGs without adding test dependencies.
async function pngPixels(src) {
  const png = await readFile(new URL(src, root));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(png[24], 8);
  assert.ok([2, 6].includes(png[25]));
  assert.equal(png[28], 0);
  const channels = png[25] === 6 ? 4 : 3, chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const packed = inflateSync(Buffer.concat(chunks)), stride = width * channels;
  assert.equal(packed.length, (stride + 1) * height);
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= channels ? pixels[index - channels] : 0;
      const up = y ? pixels[index - stride] : 0;
      const corner = y && x >= channels ? pixels[index - stride - channels] : 0;
      const p = left + up - corner;
      const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner);
      const paeth = a <= b && a <= c ? left : b <= c ? up : corner;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      pixels[index] = (packed[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return {width, height, pixel(x, y) {
    const index = (y * width + x) * channels;
    return [...pixels.subarray(index, index + 3), channels === 4 ? pixels[index + 3] : 255];
  }};
}

test('PWA keeps its identity and separates normal icons from system-maskable icons', () => {
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './');
  assert.deepEqual(manifest.icons.filter(icon => icon.purpose === 'any').map(icon => icon.sizes), ['192x192', '512x512']);
  assert.equal(manifest.icons.filter(icon => icon.purpose === 'maskable').length, 1);
  assert.ok(manifest.icons.every(icon => ['any', 'maskable'].includes(icon.purpose)));
});

test('desktop PNGs have transparent rounded corners and retain the SVG colors and glyph', async () => {
  for (const icon of manifest.icons.filter(icon => icon.purpose === 'any')) {
    assert.match(icon.src, /\?v=3$/);
    const {width, height, pixel} = await pngPixels(icon.src);
    assert.equal(`${width}x${height}`, icon.sizes);
    for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]])
      assert.equal(pixel(x, y)[3], 0, `${icon.src}: transparent corner`);
    assert.equal(pixel(Math.floor(width * .05), Math.floor(height * .05))[3], 0);
    for (const [x, y] of [[width / 2, 0], [0, height / 2], [width / 2, height - 1]])
      assert.deepEqual(pixel(x, y), [251, 113, 133, 255]);
    assert.deepEqual(pixel(Math.floor(width * .35), Math.floor(height * .65)), [8, 8, 8, 255]);
    assert.deepEqual(pixel(width / 2, Math.floor(height * .65)), [251, 113, 133, 255]);
  }
});

test('mobile maskable and Apple icons retain opaque corners for platform-owned rounding', async () => {
  const maskable = manifest.icons.find(icon => icon.purpose === 'maskable');
  for (const src of [maskable.src, 'icons/apple-touch-icon.png']) {
    const {width, height, pixel} = await pngPixels(src);
    assert.equal(width, src === maskable.src ? 512 : 180);
    assert.equal(width, height);
    for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]])
      assert.deepEqual(pixel(x, y), [251, 113, 133, 255]);
  }
});
