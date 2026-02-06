import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: [
      '@myk9/test-utils/src/setup/vitest.setup.ts',
      './src/test-setup.ts',
    ],
  },
});
