import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Copies sql.js's WASM binary into the bundle at a stable, unhashed name.
 *
 * Not a `?url` import: Vite emits those during transform regardless of whether
 * the importing module is reachable, which leaked 660KB of dead WASM into the
 * Electron bundle. Emitting it here keeps it strictly iOS-only.
 */
function emitSqlWasm(): Plugin {
  return {
    name: 'emit-sql-wasm',
    generateBundle() {
      const src = path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
      this.emitFile({
        type: 'asset',
        fileName: 'sql-wasm.wasm',
        source: fs.readFileSync(src),
      });
    },
  };
}

// The Electron plugin must not run for the iOS build — it would emit
// dist-electron/ and mark better-sqlite3 external.
export default defineConfig({
  // Capacitor serves from a custom scheme root; absolute asset paths break there.
  base: './',
  define: { __PLATFORM__: JSON.stringify('ios') },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  plugins: [react(), emitSqlWasm()],
  build: { outDir: 'dist-ios', emptyOutDir: true },
});
