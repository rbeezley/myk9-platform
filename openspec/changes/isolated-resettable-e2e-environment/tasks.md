## 1. Target safety contract

- [x] 1.1 Add a typed target resolver that requires the isolated regression gate, approved project-ref allowlist, explicit E2E Supabase URL, and matching `VITE_SUPABASE_URL`; support only the disposable local target in this slice.
- [x] 1.2 Add focused tests covering local acceptance, shared-staging rejection, URL/ref mismatch, missing configuration, and secret-free error messages.
- [x] 1.3 Invoke target verification from `scripts/qa/run-playwright-regression.sh` before the Playwright command.

## 2. Reset and seed lifecycle

- [x] 2.1 Add a TypeScript preparation/reset command that starts or reuses the local Supabase stack, reads its generated endpoint/keys without logging them, and exports job-local environment values.
- [x] 2.2 Reuse the checked-in migration history, `setup-e2e-test-users.ts`, and `supabase/seed-demo.sql` to create the canonical accounts and deterministic demo fixture.
- [x] 2.3 Add post-reset SQL assertions for the demo show/classes, judge assignments, required role grants, and no partial-preparation continuation.
- [x] 2.4 Add focused tests for status-output parsing, environment export, reset command selection, and redacted failure handling.

## 3. CI workflow wiring

- [x] 3.1 Install the Supabase CLI in the regression workflow and prepare the disposable local target before app build/auth preflight.
- [x] 3.2 Build and run the app against the generated local Supabase URL/key instead of shared staging Supabase secrets; preserve E2E password secrets only.
- [x] 3.3 Run the curated regression suite with one worker and zero retries, reset/reseed the target, and run it a second time.
- [x] 3.4 Preserve both Playwright reports, stop the local Supabase stack on success or failure, and keep workflow dispatch/manual gating without adding a schedule.
- [x] 3.5 Add source/contract coverage for the workflow's local-target, two-run, artifact, cleanup, and no-shared-staging invariants.

## 4. Documentation and verification

- [x] 4.1 Document the isolated local lifecycle, required E2E password secrets, target guard, reset ownership, cleanup, retention, and future remote-target contract in the QA/runbook docs.
- [x] 4.2 Run focused Vitest/source-contract tests, OpenSpec validation, TypeScript checks, lint, and workflow YAML/spec-list verification.
- [x] 4.3 Review the diff for shared-system writes, staging secret leakage, and unintended changes to the PR smoke suite or app behavior.
- [ ] 4.4 Record evidence in MYK9-61, open the PR with the isolation/approval gates, and complete CI/review/merge before archiving the OpenSpec change.
