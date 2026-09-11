import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'root',
          include: ['scripts/**/*.test.{ts,tsx}'],
          environment: 'node',
        },
      },
      'apps/myk9show/vitest.config.ts',
      'packages/*/vitest.config.ts',
    ],
  },
});
