## MODIFIED Requirements

### Requirement: Operator checklist covers all Phase 4 gates

The repo SHALL include an operator checklist covering show-day re-walk, offline reconnect
rehearsal, cross-app data reconciliation, capacity rehearsal, venue hardware print test, real-user
testing, and scorecard close-out. The capacity item SHALL require a passing Normal workload with at
least 50 concurrent ringside scoring sessions and all required platform evidence before G9 can
close.

#### Scenario: Checklist is complete

- **WHEN** the checklist includes every Phase 4 gate and evidence slot
- **THEN** the verifier reports checklist coverage as `ok`

#### Scenario: Capacity rehearsal is missing or failing

- **WHEN** no qualifying capacity evidence exists or any Normal workload/platform target fails
- **THEN** G9 remains open and the Performance & capacity scorecard row does not become Green
