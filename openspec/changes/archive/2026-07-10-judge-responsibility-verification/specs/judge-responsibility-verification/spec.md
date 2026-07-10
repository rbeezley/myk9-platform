## ADDED Requirements

### Requirement: Judge responsibilities are tracked against code evidence

The project SHALL maintain a judge responsibility coverage matrix mapping each real-world judge obligation in fall scope to its myK9 surface, a status label, and the evidence or verification still needed, following the same status vocabulary as the secretary matrix.

#### Scenario: Row status requires evidence

- **WHEN** a judge responsibility row is marked Covered
- **THEN** the row cites route/code evidence plus workflow, test, or rehearsal proof — a route name alone is insufficient

#### Scenario: Fall scope is not expanded

- **WHEN** a row's remediation would require a judge login, dashboard, or notification surface
- **THEN** the row is classified Deferred rather than treated as a fall gap

### Requirement: Verification is ordered by show-day risk

The verification plan SHALL order row verification so that potential show-day P0 rows — starting with judge write permissions through the ringside claim — are verified before lower-risk rows, and SHALL schedule long-lead rehearsals shared with the secretary plan as combined events.

#### Scenario: Write-permission row verified first

- **WHEN** the verification effort begins
- **THEN** J1.2 (judge-level entry score writes via the ringside claim) is verified via live staging session and RLS/RPC code trace before other rows proceed

#### Scenario: Shared rehearsal gates

- **WHEN** an offline/reconnect or print-hardware rehearsal is scheduled for the secretary plan
- **THEN** the corresponding judge rows attach to the same event instead of scheduling a duplicate
