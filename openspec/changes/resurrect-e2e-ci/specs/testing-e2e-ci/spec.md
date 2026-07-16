# Delta for testing-e2e-ci

## ADDED Requirements

### Requirement: Nightly e2e suite runs on a schedule

A scheduled GitHub Actions workflow SHALL run the curated nightly Playwright suite (~20 specs) daily against a built preview, uploading the report as an artifact.

#### Scenario: Nightly run

- **WHEN** the schedule fires (or a maintainer dispatches the workflow)
- **THEN** the curated suite runs on chromium against the preview build and the run result is visible in Actions with a report artifact

### Requirement: PR smoke gates critical journeys

The PR smoke job SHALL run connectivity, secretary regression proof, secretary critical path, payment happy path, and at-show offline scoring specs.

#### Scenario: Payment or offline regression on a PR

- **WHEN** a PR breaks the payment happy path or offline scoring queue flush
- **THEN** the E2E PR Smoke check fails before merge
