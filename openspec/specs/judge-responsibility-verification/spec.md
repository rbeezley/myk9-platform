# judge-responsibility-verification Specification

## Purpose

Track judge responsibility coverage against real code evidence, ordered by
show-day risk, so gaps in the ringside `/at-show` judge experience are found
before fall 2026 launch rather than assumed covered from a route existing.
See `docs/roles/judge-responsibility-coverage.md` (matrix) and
`docs/roles/judge-responsibility-verification-plan.md` (row-by-row audit
state) for the live tracking artifacts this spec governs.

## Requirements

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

### Requirement: Verification is ordered by show-day risk

The verification plan SHALL order row verification so that potential show-day P0 rows — starting with judge write permissions through the ringside claim — are verified before lower-risk rows, and SHALL schedule long-lead rehearsals shared with the secretary plan as combined events.

#### Scenario: Write-permission row verified first

- **WHEN** the verification effort begins
- **THEN** J1.2 (judge-level entry score writes via the ringside claim) is verified via live staging session and RLS/RPC code trace before other rows proceed

#### Scenario: Shared rehearsal gates

- **WHEN** an offline/reconnect or print-hardware rehearsal is scheduled for the secretary plan
- **THEN** the corresponding judge rows attach to the same event instead of scheduling a duplicate

### Requirement: Confirmed sweep gaps are remediated with tests

Each gap confirmed by the Phase 1 judge sweep (ringside escalation surface, passcode-regeneration claim revocation, throttle schema backfill, hides/distractions display wiring) SHALL be remediated in code with accompanying tests, preserving offline-first replication and OCC semantics on every touched ringside path.

#### Scenario: Regeneration revokes access

- **WHEN** a secretary regenerates a show's passcodes
- **THEN** ringside sessions stamped from prior codes are rejected on their next write with an explicit authorization error, and the client tells the user to re-enter a code

#### Scenario: Escalation without new surface area

- **WHEN** the ringside escalation path is added
- **THEN** it mounts existing announcement components inside the `/at-show` guard stack rather than introducing a new messaging surface, and the anon claim's read access never widens admin-gated columns
