import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Coverage thresholds must NOT apply to an individual `--shard=N/6` collection
// run (see .github/workflows/ci.yml "test-show" job). Vitest checks
// `coverage.thresholds` against whatever files that single process happened to
// cover — for a 1/6 shard that's an arbitrary partial slice, so the global and
// per-directory floors below would fail unpredictably depending on which shard
// a directory's tests land in. Thresholds are only meaningful — and only
// enforced here — against a run that saw the whole suite: a plain
// `pnpm test:coverage` locally, or the shard-coverage merge step
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
      // Vercel functions under api/ (MYK9-427 /api/geo); node environment per file.
      'api/*.test.ts',
      // Pure (Deno-free) helper modules colocated with edge functions
      'supabase/functions/_shared/*.test.ts',
      // MYK9-2170: the payout run's per-show flow with the transfer calls observed.
      'supabase/functions/cron-process-payouts/*.test.ts',
      // MYK9-2344: the plan-upgrade ownership check, scoped by Stripe mode.
      'supabase/functions/stripe-upgrade-subscription/*.test.ts',
      // MYK9-2445: Connect onboarding's lookup / 23505 race handling and body parsing.
      'supabase/functions/stripe-connect-onboard/*.test.ts',
      // Same, but for the askq tool layer, which lives in the repo-root
      // `supabase/` (not under apps/myk9show). Scoped to askq/ only — sibling
      // `_shared/http` modules use Deno-only `npm:` imports vitest can't load.
      '../../supabase/functions/_shared/askq/*.test.ts',
      '../../supabase/functions/_shared/pushWebhookAuth.test.ts',
      '../../supabase/functions/_shared/showEveNudge.test.ts',
      '../../supabase/functions/_shared/roleValidity.test.ts',
      '../../supabase/functions/_shared/roleValidityCoverage.test.ts',
      '../../supabase/functions/_shared/userRolePerson.test.ts',
      // MYK9-1208: the root-tree copy of the step-up helper must match the app-tree copy.
      '../../supabase/functions/_shared/stepUpReauthParity.test.ts',
      // MYK9-1999: the judge and street address helper, and its parity with the app-tree copy.
      '../../supabase/functions/_shared/exhibitorEmailDetails.test.ts',
      '../../supabase/functions/push-trigger-scoring/*.test.ts',
      '../../supabase/functions/push-trigger-waitlist/waitlistNotification.test.ts',
      // Whole directory rather than a named file: this allowlist is
      // hand-maintained, and a new colocated test that nobody remembers to
      // register runs green locally and never runs in CI.
      '../../supabase/functions/push-trigger-run-proximity/*.test.ts',
      '../../supabase/functions/calendar-feed/*.test.ts',
      '../../supabase/functions/_shared/sms/*.test.ts',
      '../../supabase/functions/sms-opt-in/*.test.ts',
      '../../supabase/functions/sms-stop-webhook/*.test.ts',
      '../../supabase/functions/_shared/http/__tests__/handler.test.ts',
      '../../supabase/functions/_shared/http/__tests__/cors.test.ts',
      '../../supabase/functions/_shared/standardWebhookSignature.test.ts',
      '../../supabase/functions/_shared/emailLog.test.ts',
      '../../supabase/functions/_shared/emailLogContent.test.ts',
      '../../supabase/functions/_shared/resendEmail.test.ts',
      '../../supabase/functions/_shared/authEmailFailure.test.ts',
      '../../supabase/functions/send-auth-email/delivery.test.ts',
      '../../supabase/functions/resend-webhook/handler.test.ts',
      '../../supabase/functions/_shared/webhookAuth.source.test.ts',
      // Whole directory: template builders, parity, auth, venue-directions. Before
      // 2026-08-16 only auth.test.ts was registered, so the template tests
      // never ran in CI (the allowlist trap) — all 13 files pass under this
      // config, so the glob closes that gap.
      '../../supabase/functions/send-confirmation-email/*.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-handler.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-handler.decisionStatus.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-handler.registrationNeeded.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-handler.registrationNeeded.retries.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-handler.registrationNeeded.lease.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-autoSend.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-judgeChanged.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-entryChanged.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-pullOut.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-refundDenied.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-showCancelled.test.ts',
      '../../supabase/functions/send-lifecycle-email/lifecycle-email-route.test.ts',
      '../../supabase/functions/send-results/authz.test.ts',
      '../../supabase/functions/send-email/authz.test.ts',
      '../../supabase/functions/send-email/recipientResolution.test.ts',
      '../../supabase/functions/send-registration-email/*.test.ts',
      '../../supabase/functions/validate-passcode/*.test.ts',
      // Eight files below sat on disk unrun until 2026-09-05 — the allowlist
      // trap, caught by the on-disk guard in edgeFunctionTestsAreTypechecked.
      '../../supabase/functions/_shared/fanoutCoverage.test.ts',
      '../../supabase/functions/_shared/fanoutErrors.test.ts',
      '../../supabase/functions/_shared/pushFanout.test.ts',
      '../../supabase/functions/revoke-self-auth-identity/*.test.ts',
      '../../supabase/functions/send-auth-email/actionUrl.test.ts',
      '../../supabase/functions/send-auth-email/template.test.ts',
      '../../supabase/functions/send-targeted-message/targeting.test.ts',
      '../../supabase/functions/send-waitlist-invite/auth.test.ts',
      '../../supabase/functions/generate-premium/*.test.ts',
      '../../supabase/functions/get-premium-download/*.test.ts',
      '../../supabase/functions/admin-delete-user/*.test.ts',
      '../../supabase/functions/admin-generate-reset-link/*.test.ts',
      '../../supabase/functions/admin-invite-user/*.test.ts',
      '../../supabase/functions/sentry-dashboard-metrics/metrics.test.ts',
      '../../supabase/functions/sentry-dashboard-metrics/index.source.test.ts',
      '../../supabase/functions/send-targeted-message/targeted-message-handler.test.ts',
      '../../supabase/functions/send-targeted-message/email-delivery.test.ts',
      '../../supabase/functions/send-targeted-message/person-target.test.ts',
      '../../supabase/functions/send-targeted-message/audience-pagination.test.ts',
      '../../supabase/functions/deliver-trial-packet/*.test.ts',
      '../../supabase/functions/send-judge-record/*.test.ts',
      // Trial-packet delivery moved out of the function directory so the
      // automated generator shares it; the glob above no longer reaches it.
      '../../supabase/functions/_shared/trialPacket/*.test.ts',
      '../../supabase/functions/_shared/paperwork/*.test.ts',
      '../../supabase/functions/generate-trial-packet/*.test.ts',
      '../../supabase/functions/remind-print-trial-packet/*.test.ts',
      '../../supabase/functions/remind-registry-deadline/*.test.ts',
      '../../supabase/functions/_shared/showCloseout/*.test.ts',
      '../../supabase/functions/_shared/registrySelectors.test.ts',
      '../../supabase/functions/send-access-request-emails/*.test.ts',
      'supabase/functions/stripe-webhook/*.test.ts',
      'supabase/functions/cron-waitlist-expiration/*.test.ts',
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
            // directories fails the build. Scoring
            // correctness, RBAC, and offline-first replication are the areas
            // where an untested regression is most expensive. Ratchet UP only —
            // raise a floor after intentionally adding coverage, never lower one
            // to make a regression pass. Measured 2026-07-16 via
            // `pnpm vitest run --coverage <dir>` (see MYK9-40 PR for the exact
            // per-dir numbers).
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
      // Deno-only imports of an edge function's index.ts (MYK9-2187 payoutBoot.test.ts).
      'jsr:@supabase/functions-js/edge-runtime.d.ts': path.resolve(
        __dirname,
        'src/test/mocks/denoEdgeRuntime.ts'
      ),
      'npm:stripe@17.7.0': path.resolve(__dirname, 'src/test/mocks/npmStripe.ts'),
      // Stub packages that are not installed but imported by source files under test.
      // Tests that need real behavior mock these via vi.mock() in the test file.
      'virtual:pwa-register': path.resolve(__dirname, 'src/test/mocks/virtual-pwa-register.ts'),
    },
  },
});
