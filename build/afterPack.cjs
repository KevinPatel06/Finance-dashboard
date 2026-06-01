// electron-builder afterPack hook.
//
// Removes Chromium locale packs the app doesn't use. The app is English-only,
// so we keep en-US.pak and delete the other ~54 .pak files (~40MB). This does
// NOT change app behavior — Electron falls back to en-US, which is all we ship.
//
// To support more languages later, add their codes to KEEP_LOCALES below.

const fs = require('node:fs');
const path = require('node:path');

const KEEP_LOCALES = new Set(['en-US']);

/** @param {{ appOutDir: string, electronPlatformName: string }} context */
module.exports = async function afterPack(context) {
  const localesDir = path.join(context.appOutDir, 'locales');

  let removed = 0;
  let keptBytes = 0;
  try {
    const entries = fs.readdirSync(localesDir);
    for (const file of entries) {
      if (!file.endsWith('.pak')) continue;
      const locale = file.slice(0, -'.pak'.length);
      const full = path.join(localesDir, file);
      if (KEEP_LOCALES.has(locale)) {
        keptBytes += fs.statSync(full).size;
        continue;
      }
      fs.rmSync(full);
      removed++;
    }
    console.log(
      `  • afterPack: stripped ${removed} unused locale pak(s); kept ${[...KEEP_LOCALES].join(', ')} (${(keptBytes / 1024).toFixed(0)} KB)`
    );
  } catch (err) {
    // Non-fatal: if the locales folder layout changes in a future Electron,
    // we'd rather ship extra locales than fail the build.
    console.warn('  • afterPack: locale strip skipped —', err.message);
  }
};
