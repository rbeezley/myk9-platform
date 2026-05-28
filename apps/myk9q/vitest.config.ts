import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJ0ZXN0IjoidGVzdCJ9.test-anon-key',
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      thresholds: {
        // Lowered 51 → 50 (PR #391) → 48 (this PR) to absorb Phase 0 extraction
        // drift as code moves from apps/myk9q into packages/ringside /
        // @myk9/replication. Observed on main 2026-05-27 after PR E1c/E1d:
        // statements 49.36, lines 49.55, branches 43.52. Headroom of ~1.5%
        // chosen to absorb v8 coverage non-determinism (PR #391 set the gate
        // to the bare floor and tripped on the next run).
        //
        // **If this needs lowering again, do not just lower again.** That
        // would be the third drop in a short span and the project memory's
        // strategy-B trigger (per-file `coverage.exclude` for sunset-slated
        // myk9q files instead of moving the global gate). See project memory
        // `project_myk9q_sunset_coverage`. Revisit at Phase 4 sunset.
        statements: 48,
        branches: 42,
        functions: 53,
        lines: 48,
      },
      exclude: [
        'node_modules/',
        'src/test/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
        // Workspace packages own their own coverage. The vitest alias on
        // line 58 resolves `@myk9/ringside` to `packages/ringside/src/...`
        // for fast type-checking + HMR, but the side effect is that v8
        // instruments ringside source whenever an apps/myk9q test loads
        // through a re-export shim. Ringside's own 309-test suite
        // already covers those files; double-counting them in
        // apps/myk9q's denominator inflates the gate by code that
        // belongs in a different report. PR E2d-2a surfaced this when
        // Phase-0 extraction crossed the threshold from "noise" to
        // measurable drift. Strategy B per project memory
        // `project_myk9q_sunset_coverage` — scoped exclude beats global
        // threshold drop.
        '**/packages/**',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    // Array form + regex-anchored `@myk9/ringside` so the alias doesn't
    // prefix-match `@myk9/ringside/styles`. See vite.config.ts for the
    // full rationale.
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      {
        find: /^@myk9\/ringside$/,
        replacement: path.resolve(__dirname, '../../packages/ringside/src/index.ts'),
      },
    ],
  },
});
