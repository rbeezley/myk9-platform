import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
  // The package's bin points at dist/index.js; make it directly executable.
  banner: { js: '#!/usr/bin/env node' },
});
