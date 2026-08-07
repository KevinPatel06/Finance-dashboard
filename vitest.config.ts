import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Separate from vite.config.ts on purpose: that config loads vite-plugin-electron,
// which must not run under test.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
      electron: path.resolve(__dirname, 'test/stubs/electron.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    server: { deps: { inline: ['sql.js'] } },
  },
});
