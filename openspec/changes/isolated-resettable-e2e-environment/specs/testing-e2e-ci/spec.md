## MODIFIED Requirements

### Requirement: Nightly e2e suite runs on a schedule

A manually dispatchable GitHub Actions workflow SHALL run the curated stateful Playwright suite against a proven isolated/resettable Supabase target, uploading reports as artifacts. The workflow MUST remain unscheduled until the isolated lifecycle has been evidenced and separately approved for scheduling.

#### Scenario: Isolated workflow dispatch

- **WHEN** an authorized maintainer dispatches the workflow with CI enablement and the isolated target contract configured
- **THEN** the workflow prepares the disposable target, runs the curated Chromium suite twice with a reset between runs, and exposes both reports in Actions artifacts

#### Scenario: Unproven target cannot run

- **WHEN** the workflow target is shared staging, production, missing, or not resettable
- **THEN** the workflow fails before the browser suite and does not perform stateful writes

### Requirement: PR smoke gates verified critical journeys

The PR smoke job SHALL run connectivity, secretary regression proof, and secretary critical path specs. Only specs verified green under `playwright.ci.config.ts` may be promoted into PR smoke. Payment journeys are excluded until real (non-mock) specs exist (MYK9-42); at-show offline scoring runs nightly-only until its staging seed dependency is stable. This change SHALL NOT alter the PR-smoke spec set or its shared-staging read-only policy.

#### Scenario: Secretary critical-path regression on a PR

- **WHEN** a PR breaks the secretary critical path (show creation, entry management, workbench)
- **THEN** the E2E PR Smoke check fails before merge

#### Scenario: Promotion of an unverified spec

- **WHEN** a spec is proposed for the PR smoke list
- **THEN** it enters the list only after passing locally or in the isolated nightly workflow under the CI config
