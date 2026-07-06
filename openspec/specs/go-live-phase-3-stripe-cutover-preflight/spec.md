# go-live-phase-3-stripe-cutover-preflight

## Purpose

Defines local preflight checks and evidence boundaries for Go Live Runbook Phase 3 Stripe live-mode
cutover.

## Requirements

### Requirement: Stripe cutover preflight blocks when MP-04 source is absent
The system SHALL provide a local preflight that reports Stripe live cutover as blocked when
mode-scoped Stripe ID source evidence is absent. The preflight SHALL check for livemode
migration/source markers, stale-ID recovery markers, and payout mode-mismatch markers without
contacting Stripe or Supabase.

#### Scenario: MP-04 source is missing
- **WHEN** the preflight runs before MP-04 mode-scoping is merged into the branch
- **THEN** it reports the MP-04 gate as blocked and does not mark Phase 3 ready

### Requirement: Live cutover runbook coverage is verified locally
The preflight SHALL check that the Go Live Runbook and Stripe Platform Setup runbook still document
the live-mode dashboard, webhook, secret rotation, purge, branding, manual payout, Vault, cron
smoke, payment/refund smoke, founding-member, and treasurer-onboarding steps.

#### Scenario: Runbooks include all live-money gates
- **WHEN** all required cutover step markers are present
- **THEN** the preflight reports runbook coverage as `ok`

### Requirement: Database evidence SQL is read-only
The system SHALL provide read-only SQL that can be run after approval to inspect Stripe cached-ID
purge readiness, demo live-cutover blockers, and payout cron scheduling without mutating database
state.

#### Scenario: Database checklist runs for evidence
- **WHEN** an operator supplies a read-capable database connection and runs the SQL
- **THEN** the checklist returns pass/fail evidence rows without writing data

### Requirement: Tracking keeps live-money gates open
The Go Live Runbook and OpsX tracker SHALL keep Phase 3 items unchecked until live operator evidence
is recorded. Prepared preflight work SHALL not count as completion of live-mode dashboard changes,
secret rotation, ID purge, payout settings, cron smoke, real payment/refund smoke, founding-member
grants, or treasurer onboarding.

#### Scenario: Preflight is prepared but live actions are not approved
- **WHEN** the preflight and SQL checklist are added but live actions have not been performed
- **THEN** all Phase 3 runbook items remain unchecked and the tracker lists the exact remaining gates
