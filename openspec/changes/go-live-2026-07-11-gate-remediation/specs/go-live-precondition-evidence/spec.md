## ADDED Requirements

### Requirement: July 11 go-live rows close only with named evidence

Every non-done row in the July 11 go-live report SHALL map to an OpenSpec task and SHALL remain open until its stated repository, CI, deployment, catalog, dashboard, transaction, browser, device, legal, or human evidence exists. A row that will not be completed before launch SHALL carry an explicit accepted-risk record with owner and deadline.

#### Scenario: Source work exists without deployment evidence

- **WHEN** a migration or Edge Function fix is committed but the required shared-system mutation has not been approved and verified
- **THEN** the corresponding report and runbook row remains open and names the blocked action

#### Scenario: Operator gate lacks evidence

- **WHEN** a live-money, dashboard, DNS, production-data, legal, mailbox, browser, device, or real-user gate has not been executed
- **THEN** it remains owner-action or blocked rather than being inferred complete

#### Scenario: Accepted risk is explicit

- **WHEN** a finding is intentionally deferred
- **THEN** the report records the exact risk, owner, deadline, and launch decision authority

### Requirement: Migration lineage evidence prevents regression

The repository SHALL contain unique migration version prefixes. Removal of the colliding soft-delete migration SHALL be allowed only when source and remote evidence prove the later authoritative migration preserves self-service authorization and role deactivation. Migration list and database-push dry-run output SHALL be clean before any approved push.

#### Scenario: Later function is authoritative

- **WHEN** `20260710170000` is applied remotely and its live `soft_delete_person` definition matches the required authorization and role-deactivation behavior
- **THEN** the obsolete unapplied duplicate migration is removed rather than renamed and applied

#### Scenario: Dry run proposes unexpected history changes

- **WHEN** the database-push dry run proposes reapplying, reverting, or repairing unexpected versions
- **THEN** the batch stops before any database write and records the discrepancy

### Requirement: Tracking documents preserve audit history

The source go-live report, July 11 security audit, `OPEN-TODOS.md`, go-live runbook, launch-readiness scorecard, and docs index SHALL agree after each completed slice. Original findings SHALL remain readable, with remediation evidence appended rather than history rewritten.

#### Scenario: A finding is remediated

- **WHEN** its code, test, deployment, and runtime evidence is complete
- **THEN** each applicable tracker records the same final disposition and evidence link
