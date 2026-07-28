## MODIFIED Requirements

### Requirement: Nightly e2e suite runs on a schedule

A scheduled and manually dispatchable GitHub Actions workflow SHALL run the curated stateful Playwright suite against a disposable, resettable Supabase target. Each successful job MUST prepare deterministic fixtures, expose the generated local app URL and service-role configuration to UAT setup without shared-staging secrets, run the suite twice with a reset between runs, and upload both reports as artifacts. The workflow MUST remain bounded, variable-gated, one-worker, zero-retry, and fail closed before browser execution when target preparation or configuration is incomplete.

#### Scenario: Weekly isolated regression

- **WHEN** the weekly schedule fires and regression CI is enabled
- **THEN** the workflow prepares a disposable local target, runs the curated Chromium suite, resets and reseeds the target, runs the suite again, uploads both reports, and destroys the target

#### Scenario: Maintainer dispatch

- **WHEN** an authorized maintainer manually dispatches the workflow for a branch
- **THEN** the same isolated two-run lifecycle executes and exposes a branch-specific result and report artifacts in GitHub Actions

#### Scenario: Generated UAT configuration

- **WHEN** target preparation succeeds
- **THEN** subsequent UAT setup and browser steps receive the generated `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` through the job environment without reading shared-staging Supabase secrets

#### Scenario: Incomplete or unsafe target

- **WHEN** the isolated target, generated URL, service-role key, or target identity is missing, mismatched, shared staging, or production
- **THEN** the workflow fails before the stateful browser suite and performs no stateful write against the unsafe target

### Requirement: PR smoke gates verified critical journeys

The PR smoke job SHALL run connectivity, secretary regression proof, and secretary critical path specs. Only specs verified green under `playwright.ci.config.ts` may be promoted into PR smoke. Payment journeys are excluded until real (non-mock) specs exist (MYK9-42); at-show offline scoring runs scheduled-regression-only until its seed dependency is stable. This change SHALL NOT alter the PR-smoke spec set or its shared-staging read-only policy.

#### Scenario: Secretary critical-path regression on a PR

- **WHEN** a PR breaks the secretary critical path (show creation, entry management, workbench)
- **THEN** the E2E PR Smoke check fails before merge

#### Scenario: Promotion of an unverified spec

- **WHEN** a spec is proposed for the PR smoke list
- **THEN** it enters the list only after passing locally or in the isolated scheduled regression workflow under the CI config
