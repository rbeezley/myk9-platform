import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Coverage thresholds must NOT apply to an individual `--shard=N/3` collection
// run (see .github/workflows/ci.yml "test-show" job). Vitest checks
// `coverage.thresholds` against whatever files that single process happened to
// cover — for a 1/3 shard that's an arbitrary partial slice, so the global and
// per-directory floors below would fail unpredictably depending on which shard
// a directory's tests land in. Thresholds are only meaningful — and only
// enforced here — against a run that saw the whole suite: a plain
// `pnpm test:coverage` locally, the non-sharded post-merge
// `test-show-coverage` job, or the shard-coverage merge step
// (`--mergeReports=...`, which carries no `--shard` flag). MYK9-40.
const isShardCollectionRun = process.argv.some(arg => arg.startsWith('--shard='));

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
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      // Coverage-ratchet CLI (MYK9-40) — colocated with scripts/coverage-ratchet.ts,
      // mirrors the root scripts/qa/code-quality-ratchet.test.ts pattern.
      'scripts/*.test.ts',
      // Pure (Deno-free) helper modules colocated with edge functions
      'supabase/functions/_shared/*.test.ts',
      // Same, but for the askq tool layer, which lives in the repo-root
      // `supabase/` (not under apps/myk9show). Scoped to askq/ only — sibling
      // `_shared/http` modules use Deno-only `npm:` imports vitest can't load.
      '../../supabase/functions/_shared/askq/*.test.ts',
      '../../supabase/functions/_shared/pushWebhookAuth.test.ts',
      '../../supabase/functions/_shared/roleValidity.test.ts',
      '../../supabase/functions/_shared/roleValidityCoverage.test.ts',
      '../../supabase/functions/push-trigger-waitlist/waitlistNotification.test.ts',
      '../../supabase/functions/_shared/http/__tests__/handler.test.ts',
      '../../supabase/functions/_shared/http/__tests__/cors.test.ts',
      '../../supabase/functions/_shared/standardWebhookSignature.test.ts',
      '../../supabase/functions/_shared/resendEmail.test.ts',
      '../../supabase/functions/_shared/authEmailFailure.test.ts',
      '../../supabase/functions/send-auth-email/delivery.test.ts',
      '../../supabase/functions/resend-webhook/handler.test.ts',
      '../../supabase/functions/_shared/webhookAuth.source.test.ts',
      '../../supabase/functions/send-confirmation-email/auth.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-handler.test.ts',
      '../../supabase/functions/send-results/authz.test.ts',
      '../../supabase/functions/send-email/authz.test.ts',
      '../../supabase/functions/send-email/recipientResolution.test.ts',
      '../../supabase/functions/send-registration-email/dateFormat.test.ts',
      '../../supabase/functions/validate-passcode/*.test.ts',
      '../../supabase/functions/generate-premium/*.test.ts',
      '../../supabase/functions/admin-delete-user/*.test.ts',
      '../../supabase/functions/admin-generate-reset-link/*.test.ts',
      '../../supabase/functions/admin-invite-user/*.test.ts',
      '../../supabase/functions/send-targeted-message/targeted-message-handler.test.ts',
      'supabase/functions/stripe-webhook/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/*.spec.ts', // Playwright specs
      '**/*.integration.test.ts', // Integration tests run via vitest.integration.config.ts
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      thresholds: isShardCollectionRun
        ? undefined
        : {
            statements: 33,
            branches: 24,
            functions: 29,
            lines: 35,
            // Per-directory floors (MYK9-40) — set slightly below measured coverage
            // so CI is green today but a real regression in these high-stakes
            // directories fails the build. Money paths (payment), scoring
            // correctness, RBAC, and offline-first replication are the areas
            // where an untested regression is most expensive. Ratchet UP only —
            // raise a floor after intentionally adding coverage, never lower one
            // to make a regression pass. Measured 2026-07-16 via
            // `pnpm vitest run --coverage <dir>` (see MYK9-40 PR for the exact
            // per-dir numbers).
            'src/services/payment/**': {
              statements: 80,
              branches: 85,
              functions: 95,
              lines: 80,
            },
            'src/services/scoring/**': {
              statements: 80,
              branches: 68,
              functions: 85,
              lines: 80,
            },
            'src/services/rbac/**': {
              statements: 3,
              branches: 6,
              functions: 4,
              lines: 2,
            },
            'src/services/replication/**': {
              statements: 78,
              branches: 80,
              // Merged-shard function coverage is 73.94% (lower than a local
              // single-dir run because the full suite imports more replication
              // files with uncovered functions). Floor sits just below it.
              functions: 73,
              lines: 78,
            },
          },
      exclude: ['node_modules/', 'src/test/', '**/*.d.ts', '**/*.config.*', '**/types/**'],
    },
    // Increase timeout for slower tests
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'npm:@supabase/supabase-js@2.49.1': path.resolve(
        __dirname,
        'node_modules/@supabase/supabase-js/dist/index.mjs'
      ),
      // Stub packages that are not installed but imported by source files under test.
      // Tests that need real behavior mock these via vi.mock() in the test file.
      pako: path.resolve(__dirname, 'src/test/mocks/pako.ts'),
      'virtual:pwa-register': path.resolve(__dirname, 'src/test/mocks/virtual-pwa-register.ts'),
    },
  },
});
