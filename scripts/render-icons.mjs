// Rasterises the app icon (shared/appIcon.ts) into every PNG the apps ship:
//
//   node scripts/render-icons.mjs
//
// Re-run whenever shared/appIcon.ts changes. Needs Node 23.6+ (imports the .ts
// directly) and Microsoft Edge, driven headless over the DevTools protocol like
// scripts/phone-shots.mjs: Edge draws the SVG onto a canvas, Node writes the PNG.
//
// iOS and Android get full-bleed squares with NO alpha channel (iOS shows a black
// background behind transparent pixels; both platforms mask the corners
// themselves). Android's launcher shows only the middle ~2/3 of the layer, so
// its copy has the mark scaled down.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { appIconSvg } from '../shared/appIcon.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = [
  // [file, size, svg options, keep alpha?]
  ['build/icon.svg', 0, { rounded: true }],
  ['build/icon.png', 1024, { rounded: true }, true],
  ['branding/app-icon.png', 1024, { rounded: true }, true],
  ['branding/app-icon-square.png', 1024, {}, false],
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, {}, false],
  ['android/app/src/main/res/drawable-nodpi/ic_launcher_full.png', 1024, { markScale: 0.8 }, false],
];

// ---------------------------------------------------------------- PNG encoder
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
/** rgba: Uint8 RGBA pixels. alpha=false writes 8-bit RGB (colour type 2). */
function encodePng(rgba, size, alpha) {
  const ch = alpha ? 4 : 3;
  const raw = Buffer.alloc(size * (size * ch + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * ch + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const d = row + 1 + x * ch;
      raw[d] = rgba[s];
      raw[d + 1] = rgba[s + 1];
      raw[d + 2] = rgba[s + 2];
      if (alpha) raw[d + 3] = rgba[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- Edge
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) throw new Error('Microsoft Edge not found');
const PORT = 9334;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'render-icons-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch {}
  if (!wsUrl) await sleep(200);
}
if (!wsUrl) throw new Error('Edge did not start');
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const evaluate = (expression) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => {
      const r = m.result;
      if (m.error || r.exceptionDetails) reject(new Error(m.error?.message ?? r.exceptionDetails.exception?.description));
      else resolve(r.result.value);
    });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });

/**
 * Draw an SVG string at size×size and return its RGBA pixels. The pixels come
 * back in 1MB slices: a single ~5MB DevTools message never arrives.
 */
async function rasterise(svg, size) {
  const len = await evaluate(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = ${size};
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, ${size}, ${size});
    const px = g.getImageData(0, 0, ${size}, ${size}).data;
    let s = '';
    for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
    window.__px = btoa(s);
    return window.__px.length;
  })()`);
  let b64 = '';
  for (let at = 0; at < len; at += 1 << 20) b64 += await evaluate(`window.__px.slice(${at}, ${at + (1 << 20)})`);
  return Buffer.from(b64, 'base64');
}

try {
  for (const [file, size, opts, alpha] of OUT) {
    const dest = path.join(ROOT, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const svg = appIconSvg(opts);
    if (!size) fs.writeFileSync(dest, svg + '\n');
    else fs.writeFileSync(dest, encodePng(await rasterise(svg, size), size, alpha));
    console.log('wrote', file);
  }
} finally {
  ws.close();
  edge.kill();
}
