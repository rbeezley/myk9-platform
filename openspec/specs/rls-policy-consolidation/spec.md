# RLS Policy Consolidation

## Purpose

Define the authorization-equivalence, overlap, executable-evidence, and applied-state gates for consolidating permissive PostgreSQL row-level security policies.

## Requirements

### Requirement: Effective RLS access remains unchanged

For each of the 23 affected tables, the consolidated or intentionally retained policies SHALL return the same `USING` and `WITH CHECK` result as the pre-change policy union for public-only, authenticated, and other public-member role classes on every applicable command.

#### Scenario: Existing access remains allowed

- **WHEN** any combination of the unchanged ownership, administrator, show-official, secretary, manager, or authentication predicates allowed a row before consolidation
- **THEN** the equivalent role and command SHALL continue to allow that row after consolidation

#### Scenario: Existing denial remains denied

- **WHEN** none of the pre-change policies applicable to a role and command allowed a row or proposed row
- **THEN** the consolidated policy SHALL continue to deny that row or proposed row

#### Scenario: Update checks preserve old and new row semantics

- **WHEN** an authenticated caller updates a table whose prior policies supplied `USING` and `WITH CHECK` behavior
- **THEN** both the old-row visibility decision and the proposed-row acceptance decision SHALL equal their respective pre-change policy unions

### Requirement: Affected API role and command groups do not overlap

After consolidation, at most one permissive policy SHALL apply to each affected table, role, and SQL command combination except the five documented role-mismatched groups on `dogs` and `push_subscriptions`.

#### Scenario: Public read and authenticated management policies

- **WHEN** a table previously combined a broad `SELECT` policy with an authenticated `ALL` management policy
- **THEN** the management authorization SHALL be expressed only on write commands and `SELECT` SHALL have one effective permissive policy per API role

#### Scenario: Role-sensitive public policies remain layered

- **WHEN** a prior `public` policy and an `authenticated` policy had different effective predicates
- **THEN** the policies SHALL remain layered when no role-set rewrite can preserve every hosted role, and the remainder SHALL be documented instead of granting or revoking access

### Requirement: Every affected table has executable equivalence evidence

The repository SHALL contain an assertion-first contract case for each of the 23 affected tables that proves pre- and post-change policy unions are logically equivalent and that the migration creates the expected policy topology.

#### Scenario: Complete table inventory

- **WHEN** the consolidation contract runs
- **THEN** it SHALL enumerate exactly the 23 tables captured from the applied `pg_policies` inventory

#### Scenario: Exhaustive predicate outcomes

- **WHEN** the contract evaluates a table's unchanged predicate atoms
- **THEN** it SHALL compare pre- and post-change authorization for every possible truth assignment, role class, command, and applicable `USING` or `WITH CHECK` path

#### Scenario: Migration drift

- **WHEN** a policy role, command, predicate fragment, or required drop in the migration no longer matches the reviewed disposition
- **THEN** the contract SHALL fail before deployment

### Requirement: Applied-state verification remains an operator gate

The change SHALL provide read-only catalog evidence for the applied policy topology and SHALL NOT treat the linked database remediation as complete until an explicitly approved push and post-push advisor check are recorded.

#### Scenario: Work before database approval

- **WHEN** implementation and local verification are complete but no database-push approval has been given
- **THEN** repository artifacts MAY be committed and reviewed while the applied-state task remains incomplete

#### Scenario: Post-push disposition

- **WHEN** the migrations are applied with approval
- **THEN** the operator SHALL run the overlap inventory and advisor checks and record all remaining `multiple_permissive_policies` findings or state that none remain
