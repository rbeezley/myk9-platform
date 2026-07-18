## ADDED Requirements

### Requirement: Stateful regression runs use an approved isolated target

The regression preparation and runner SHALL require an explicit isolated target identity, an approved project reference, and an app Supabase URL that matches that target. The implementation MUST reject the shared staging project, production, missing configuration, ambiguous configuration, and target/URL mismatches before any stateful Playwright test starts.

#### Scenario: Local target is accepted

- **WHEN** the regression gate is enabled, the target is `isolated`, the approved project reference is `local`, the E2E project reference is `local`, and both the E2E and app URLs point to the local Supabase API
- **THEN** target verification succeeds without printing credentials

#### Scenario: Shared staging is rejected

- **WHEN** the E2E project reference or either configured Supabase URL identifies project `sojmvhhwsjxmfistvzbe`
- **THEN** target verification fails before Playwright starts

#### Scenario: Mismatched build target is rejected

- **WHEN** the explicit E2E Supabase URL differs from `VITE_SUPABASE_URL`
- **THEN** target verification fails and reports only the non-secret target mismatch

#### Scenario: Missing or ambiguous target is rejected

- **WHEN** the target identity, approved project reference, E2E URL, or app URL is missing or cannot be parsed
- **THEN** target verification fails closed before any database or browser write

### Requirement: The isolated target is resettable from repository-controlled sources

The preparation command SHALL start a disposable local Supabase stack, apply the checked-in migration history, create the canonical E2E accounts, run the existing deterministic demo seed, and verify the required fixture rows before the browser suite starts. A reset command SHALL repeat the same migration/seed lifecycle against the running stack without relying on a one-time manual seed.

#### Scenario: Fresh target preparation

- **WHEN** CI prepares the isolated target
- **THEN** the local Supabase services start, migrations apply, E2E accounts are available, `supabase/seed-demo.sql` succeeds, and post-seed assertions confirm the demo show, classes, judge assignments, and role grants

#### Scenario: Reset restores the baseline

- **WHEN** CI resets the target after a completed regression run
- **THEN** the database is reset and reseeded from repository-controlled sources and the same post-seed assertions pass before the second run begins

#### Scenario: Partial fixture preparation fails closed

- **WHEN** account creation, seed execution, or any required post-seed assertion fails
- **THEN** the workflow stops before Playwright and reports a remediation-oriented failure without continuing against partial data

### Requirement: Stateful regression evidence is repeatable and isolated

The regression workflow SHALL run the curated Playwright suite with one worker and zero retries, then reset/reseed the same isolated target and run the suite a second time. It SHALL preserve and upload reports from both runs. The workflow MUST not pass shared staging Supabase credentials to the stateful job and MUST keep real payment, email, webhook, and production callback side effects disabled or out of scope.

#### Scenario: Two clean runs produce evidence

- **WHEN** the workflow preparation and first suite run succeed
- **THEN** CI resets/reseeds the target, runs the same curated suite again, and uploads both run reports as artifacts

#### Scenario: Shared staging secrets are absent from the stateful workflow

- **WHEN** the workflow prepares the browser build and test process
- **THEN** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` come from the disposable local target, while only E2E account passwords come from repository secrets

#### Scenario: Workflow remains explicitly gated

- **WHEN** the regression workflow is dispatched without the approved CI enablement variable or isolated target contract
- **THEN** the job does not run the stateful suite and the existing shell guard remains fail-closed
