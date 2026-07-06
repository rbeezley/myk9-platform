## ADDED Requirements

### Requirement: Phase 2 verifier separates source readiness from shared-system evidence

The system SHALL provide a repeatable Go Live Phase 2 verification path that can run local/source checks without credentials and can optionally run read-only database checks when an operator supplies a database URL. The verifier SHALL NOT mutate Supabase, GitHub, Vercel, Stripe, or any other shared system.

#### Scenario: Local source verification runs without credentials

- **WHEN** the Phase 2 verifier is run without a database URL
- **THEN** it reports source-readiness checks and prints the read-only SQL needed for staging/prod evidence without attempting a network or database write

#### Scenario: Database verification is read-only

- **WHEN** the Phase 2 verifier is run with a database URL
- **THEN** it executes only read-only SQL checks and fails if the database command fails

### Requirement: Judge preload readiness blocks header-only data

The system SHALL detect whether `supabase/seed-data/akc-ukc-judges.csv` contains real judge data rows before an import migration is generated. A header-only CSV SHALL be reported as blocked and SHALL NOT be treated as Phase 2 completion evidence.

#### Scenario: Header-only judge CSV is blocked

- **WHEN** the judge CSV contains comments and the header but no data rows
- **THEN** the verifier reports the judge preload as blocked pending real AKC/UKC exports

#### Scenario: Judge CSV with data can proceed to import generation

- **WHEN** the judge CSV contains one or more non-comment data rows after the header
- **THEN** the verifier reports the local judge preload input as ready for `scripts/import-judges.ts`

### Requirement: Seed and access checks are captured as one operator-ready checklist

The system SHALL capture the Go Live Runbook Phase 2 database checks in a single read-only checklist covering judge assignments, active role grants, ringside passcodes, demo show/classes, stale-anon cleanup cron, and judge preload results. The checklist SHALL produce clear pass/fail rows suitable for PR evidence and morning approvals.

#### Scenario: Staging seed data is complete

- **WHEN** the database contains judge assignments, required active role grants, demo passcodes, and demo show classes
- **THEN** the read-only checklist reports those rows as `ok`

#### Scenario: A silent seed gap is present

- **WHEN** any required seed/access row is missing
- **THEN** the read-only checklist reports the specific row as `fail` with enough detail to guide repair

### Requirement: Runbook tracking distinguishes complete, prepared, and operator-gated items

The Go Live Runbook and OpsX batch tracker SHALL mark Phase 2 items complete only when repo evidence plus staging/prod/operator evidence prove completion. Items that are prepared but still require judge exports, dashboard toggles, live cold-session walks, database pushes, or seed repairs SHALL remain unchecked with a morning approval or operator checklist entry.

#### Scenario: Prepared work is not over-marked complete

- **WHEN** the verifier and docs are added but real judge exports or live database evidence are still missing
- **THEN** the Phase 2 runbook items remain unchecked and the batch tracker lists the exact blocker
