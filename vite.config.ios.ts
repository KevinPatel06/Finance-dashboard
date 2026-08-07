import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

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
  plugins: [react()],
  build: { outDir: 'dist-ios', emptyOutDir: true },
});
