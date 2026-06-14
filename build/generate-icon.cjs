// One-off icon rasterizer.
//
// electron-builder generates the platform icons (Windows .ico, etc.) from a
// single high-res build/icon.png. We have no SVG rasterizer (sharp/ImageMagick)
// on this machine, but Electron's bundled Chromium renders SVG perfectly — so
// this script loads build/icon.svg in an offscreen window at 1024×1024 and
// writes build/icon.png.
//
//   npx electron build/generate-icon.cjs
//
// Re-run whenever build/icon.svg changes.

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 1024;
const svgPath = path.join(__dirname, 'icon.svg');
const outPath = path.join(__dirname, 'icon.png');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <style>html,body{margin:0;padding:0;background:transparent}
    svg{display:block;width:${SIZE}px;height:${SIZE}px}</style></head>
    <body>${svg}</body></html>`;

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  // Give the renderer a beat to paint fonts/filters.
  await new Promise((r) => setTimeout(r, 400));

  const image = await win.capturePage();
  fs.writeFileSync(outPath, image.toPNG());
  console.log(`Wrote ${outPath} (${image.getSize().width}×${image.getSize().height})`);

  win.destroy();
  app.quit();
});
