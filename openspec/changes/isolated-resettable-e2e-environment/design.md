## Context

The curated stateful Playwright suite is already separated from the read-only health workflow, but `.github/workflows/nightly-e2e.yml` currently expects `VITE_SUPABASE_URL` and credentials that point at shared staging. The runner is guarded by `MYK9_PLAYWRIGHT_REGRESSION_TARGET=isolated`, yet that value is only a string gate; it does not prove the URL, project identity, database reset, or external side effects are isolated.

The repository already has the pieces needed for a deterministic fixture: the checked-in migration history, `supabase/seed-demo.sql`, the E2E account setup script, auth preflight, and the existing Playwright regression config. The design composes those pieces into a disposable local Supabase stack per CI job. This is the accepted equivalent of a separate E2E project: it has its own Postgres, Auth, Storage, Realtime, API, and local service endpoints, is destroyed with the job, and cannot write to shared staging.

No application UI, replicated show-day read path, or mutation layer changes. The browser suite continues to exercise the real app against the isolated Supabase endpoints; only the test environment and CI wiring change.

## Goals / Non-Goals

**Goals:**

- Start a fresh local Supabase stack for each regression job and apply the repository migration history.
- Create the canonical E2E accounts, run the existing deterministic demo seed, and verify the required fixture rows before Playwright starts.
- Reset and reseed the same stack between two complete regression runs so repeatability is proven.
- Fail closed when the regression target is missing, ambiguous, points at shared staging, or does not match the URL used to build/run the app.
- Export only ephemeral local target values to the current CI job and avoid staging Supabase secrets in the stateful workflow.
- Keep one worker, zero retries, bounded timeouts, and both run reports as CI artifacts.
- Document the local lifecycle and the future remote-target contract without provisioning or mutating a shared Supabase project in this change.

**Non-Goals:**

- No production or shared-staging database writes, function deploys, secret changes, or Vercel/GitHub environment mutations.
- No new application fixtures or user-facing test mode; reuse the existing migration and `seed-demo.sql` contract.
- No rewrite of stale Playwright journeys tracked by MYK9-46.
- No real Stripe capture/refund, outbound email, webhook delivery, or production callback; excluded integrations remain mocked/test-local.
- No scheduled nightly activation; workflow scheduling remains a separate operator decision after the lifecycle evidence is accepted.
- No changes to offline-first replication behavior; the isolated target only changes where test data is stored.

## Decisions

### 1. Use a disposable local Supabase stack in CI

Use the checked-in `supabase/config.toml`, `supabase start`, `supabase db reset`, and `supabase stop` on the GitHub-hosted runner. A remote E2E project would add project provisioning, billing, secret rotation, and environment drift before the repository can prove the basic safety contract. The local stack provides equivalent isolation for the stateful suite and is recreated for every job.

### 2. Make target identity an explicit typed contract

Add a TypeScript resolver used by the workflow preparation and regression runner. It requires the regression gate, an approved project-ref allowlist, an explicit E2E Supabase URL, and a matching app build URL. The initial supported target is `projectRef=local` with a loopback API URL. Any shared staging project ref, staging host, missing value, or URL/ref mismatch fails before Playwright runs.

The resolver is pure and unit-tested so the most important safety behavior does not require Docker or a live database. Secrets are never included in errors or logs.

### 3. Reuse the existing migration, account, and demo-fixture sources of truth

The reset script runs the repository migrations, then invokes `apps/myk9show/scripts/setup-e2e-test-users.ts`, then runs the existing idempotent `supabase/seed-demo.sql` through the local Postgres URL. Post-reset SQL assertions verify the demo show, classes, judge assignments, and required role grants. This avoids creating a second fixture model that could drift from the secretary, judge, and exhibitor journeys.

### 4. Keep CI target values job-local

The preparation script reads the local Supabase CLI status output and writes only the generated local API URL, anon key, service-role key, database URL, and target identity to `GITHUB_ENV`. The workflow no longer supplies shared staging `VITE_SUPABASE_*` secrets to the stateful regression job. E2E account passwords remain repository secrets and are used only by the local account setup and test steps.

### 5. Prove reset repeatability in one workflow run

The workflow prepares the stack, builds the app against the local API, runs the curated suite, resets/reseeds, and runs the suite again. The first report is copied before the second run, and both reports are uploaded. This proves the reset is not merely a one-time setup and gives reviewers evidence that the second run starts from the same fixture contract.

### 6. Retain existing workflow gating

The workflow remains manual-dispatch and variable-gated. `scripts/qa/run-playwright-regression.sh` continues to reject any invocation without the explicit isolated target; the new typed target verification runs before the test command. Scheduling and required-check promotion stay outside this implementation slice.

## Risks / Trade-offs

- **Local Supabase startup or Docker availability is unreliable in CI** → fail the preparation step before the browser run, upload logs through the job, and keep the workflow manual-only until one clean lifecycle is evidenced.
- **The seed references accounts that were not created** → create accounts before seeding and assert the required rows/roles; never allow a partially seeded target to proceed.
- **A future contributor points the built app at staging while the target guard says local** → compare `VITE_SUPABASE_URL` to the explicit E2E target URL and reject mismatches before Playwright.
- **The local stack receives real external side effects** → use local Auth/Storage/Realtime and test-only configuration; keep real payment/email workflows out of the curated list and document the no-external-callback contract.
- **Reset deletes data needed by a test** → make the existing deterministic seed the only baseline and require a second reset/run in CI before treating the environment as proven.
- **The repository fixture evolves without the reset script being checked** → add source/contract tests for the target resolver and reset command, and keep the seed/post-reset assertions in the script.
- **CI logs expose generated local credentials** → never print status output or secret values; write them only to the job environment and use redacted success messages.
