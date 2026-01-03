import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['react', 'zustand'],
  treeshake: true,
  splitting: false,
});
