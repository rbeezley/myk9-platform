## Original request

`start 61`

## Why

MYK9-61 is the launch-readiness gap that prevents the curated stateful Playwright regression suite from running safely in CI. The current workflow is intentionally fail-closed because its journeys can mutate entries, scoring, payments, auth, and offline-sync data against shared staging. A genuinely isolated, resettable target would turn that manual-only suite into repeatable evidence without putting staging or production at risk.

This directly supports the fall 2026 launch goal by making secretary, judge, offline, and cross-role regression evidence repeatable before release. It is infrastructure and test-safety work only; it does not add a product page or duplicate an existing user-facing surface.

## What Changes

- Define an approved isolated E2E target contract that rejects shared staging, production, missing, or ambiguous configuration before a stateful run.
- Provision and document the isolated target's environment-specific auth, storage, realtime, functions, cron, webhook, and test-integration boundaries.
- Add repository-controlled migration/seed/reset automation that restores deterministic fixtures and can be run repeatedly.
- Add CI wiring for the isolated target with one worker, zero retries, bounded timeouts, report artifacts, and fail-closed target checks.
- Prove a fresh reset → curated regression run → second reset → repeat run lifecycle without writes reaching shared staging.
- Document ownership, credential rotation, cleanup/retention, provisioning, and the safe procedure for enabling the workflow.

## Capabilities

### New Capabilities

- `isolated-e2e-environment`: Approved target identity, deterministic reset/seed behavior, side-effect isolation, and repeatable evidence for stateful browser regression.

### Modified Capabilities

- `testing-e2e-ci`: The stateful regression workflow may run only against a proven isolated/resettable target and must enforce the isolation and repeatability gates before activation.

## Impact

- Affected code: `.github/workflows/nightly-e2e.yml`, `apps/myk9show/playwright.ci.config.ts`, E2E helpers/scripts, package scripts, and focused contract tests.
- Affected infrastructure: a separate Supabase E2E project or equivalent isolated target, test-only auth/storage/realtime/functions/cron configuration, and mocked/test-mode external integrations.
- Affected documentation: E2E suite map, workflow/runbook guidance, provisioning/reset instructions, and evidence records.
- No application UI, user-facing workflow, shared staging database mutation, production mutation, or real Stripe/email side effect is in scope.
