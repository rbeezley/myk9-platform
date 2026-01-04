import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: [
    'react',
    '@tanstack/react-query',
    '@dnd-kit/core',
    '@dnd-kit/sortable',
  ],
});
