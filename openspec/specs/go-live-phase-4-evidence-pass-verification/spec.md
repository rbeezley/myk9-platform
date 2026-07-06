# go-live-phase-4-evidence-pass-verification

## Purpose

Defines local checklist verification and evidence-bound tracking for Go Live Runbook Phase 4.

## Requirements

### Requirement: Phase 4 evidence verifier prepares but does not close live gates
The system SHALL provide a local verifier that checks Phase 4 source/checklist readiness and reports
staging, hardware, and real-user evidence as blocked until artifact links are recorded.

#### Scenario: Live evidence is not present
- **WHEN** the verifier runs before Phase 4 walks are executed
- **THEN** it reports the live evidence gates as blocked and does not mark Phase 4 complete

### Requirement: Operator checklist covers all Phase 4 gates
The repo SHALL include an operator checklist covering show-day re-walk, offline reconnect rehearsal,
venue hardware print test, real-user testing, and scorecard close-out.

#### Scenario: Checklist is complete
- **WHEN** the checklist includes every Phase 4 gate and evidence slot
- **THEN** the verifier reports checklist coverage as `ok`

### Requirement: Tracking keeps scorecard updates evidence-bound
The Go Live Runbook, OpsX tracker, and scorecard SHALL only mark Phase 4 rows complete/Green when
supporting evidence exists.

#### Scenario: Prepared checklist exists without evidence
- **WHEN** the checklist exists but staging/hardware/real-user evidence is missing
- **THEN** Phase 4 runbook items remain unchecked and the tracker lists the remaining gates
