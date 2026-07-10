## MODIFIED Requirements

### Requirement: Judge responsibilities are tracked against code evidence

The project SHALL maintain a judge responsibility coverage matrix mapping each real-world judge obligation in fall scope to its myK9 surface, a status label, and the evidence or verification still needed, following the same status vocabulary as the secretary matrix.

#### Scenario: Row status requires evidence

- **WHEN** a judge responsibility row is marked Covered
- **THEN** the row cites route/code evidence plus workflow, test, or rehearsal proof — a route name alone is insufficient

#### Scenario: Fall scope follows the un-defer decision

- **WHEN** a row's remediation would require schedule-change notifications, cross-club judging history, or self-service surfaces beyond the shipped judge dashboard
- **THEN** the row is classified Deferred rather than treated as a fall gap

#### Scenario: Shipped judge dashboard is owned

- **WHEN** a row concerns the shipped judge dashboard (`/judge/dashboard`, `/judge/stats`, `/judge/check-in`)
- **THEN** it is treated as in fall scope per the 2026-07-10 owner un-defer decision and verified like any other role surface

## ADDED Requirements

### Requirement: Confirmed sweep gaps are remediated with tests

Each gap confirmed by the Phase 1 judge sweep (ringside escalation surface, passcode-regeneration claim revocation, throttle schema backfill, hides/distractions display wiring) SHALL be remediated in code with accompanying tests, preserving offline-first replication and OCC semantics on every touched ringside path.

#### Scenario: Regeneration revokes access

- **WHEN** a secretary regenerates a show's passcodes
- **THEN** ringside sessions stamped from prior codes are rejected on their next write with an explicit authorization error, and the client tells the user to re-enter a code

#### Scenario: Escalation without new surface area

- **WHEN** the ringside escalation path is added
- **THEN** it mounts existing announcement components inside the `/at-show` guard stack rather than introducing a new messaging surface, and the anon claim's read access never widens admin-gated columns
