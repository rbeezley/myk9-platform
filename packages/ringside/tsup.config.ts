import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // Dependency-free run-queue helpers, importable without pulling the whole
    // ringside UI (dnd-kit, scoring-ui, confetti) into a consumer's entry chunk.
    'run-queue': 'src/pages/EntryList/runQueue.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['react', 'react-dom'],
  treeshake: true,
  splitting: false,
});
