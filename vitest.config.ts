import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // The real `obsidian` package is types-only (no runtime entry), so alias
      // it to a lightweight stub for modules that import runtime values.
      obsidian: fileURLToPath(new URL('./tests/obsidian-mock.ts', import.meta.url)),
    },
  },
});
