# testing-e2e-ci Specification

## Purpose
TBD - created by archiving change resurrect-e2e-ci. Update Purpose after archive.
## Requirements
### Requirement: Nightly e2e suite runs on a schedule

A scheduled GitHub Actions workflow SHALL run the curated nightly Playwright suite (~20 specs) daily against a built preview, uploading the report as an artifact.

#### Scenario: Nightly run

- **WHEN** the schedule fires (or a maintainer dispatches the workflow)
- **THEN** the curated suite runs on chromium against the preview build and the run result is visible in Actions with a report artifact

### Requirement: PR smoke gates verified critical journeys

The PR smoke job SHALL run connectivity, secretary regression proof, and secretary critical path specs. Only specs verified green under `playwright.ci.config.ts` may be promoted into PR smoke. Payment journeys are excluded until real (non-mock) specs exist (MYK9-42); at-show offline scoring runs nightly-only until its staging seed dependency is stable.

#### Scenario: Secretary critical-path regression on a PR

- **WHEN** a PR breaks the secretary critical path (show creation, entry management, workbench)
- **THEN** the E2E PR Smoke check fails before merge

#### Scenario: Promotion of an unverified spec

- **WHEN** a spec is proposed for the PR smoke list
- **THEN** it enters the list only after passing locally or in nightly under the CI config

