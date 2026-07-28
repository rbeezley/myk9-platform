## ADDED Requirements

### Requirement: Every public foreign key has supporting index coverage

The database SHALL provide a valid, ready, non-partial index whose leading keys cover every public
foreign key's referencing columns, including all foreign keys on entries, classes, trials, shows,
dog registrations, user roles, and waitlist entries.

#### Scenario: Current foreign-key inventory is migrated

- **WHEN** the additive index migration has been applied
- **THEN** the public-schema foreign-key inventory query returns zero uncovered constraints

#### Scenario: Hot-path foreign keys remain protected

- **WHEN** the migration source contract checks the named show-day tables
- **THEN** each foreign-key column is covered explicitly or the change contains a reviewed,
  one-line deliberate exception

### Requirement: Destructive index cleanup is independently reviewable

Index additions and index drops MUST be delivered in separate ordered migrations, and an index
MUST NOT be dropped solely because its recorded scan count is zero.

#### Scenario: Exact duplicates are removed

- **WHEN** two valid indexes on the same table have identical uniqueness, keys, operator classes,
  collations, options, expressions, and predicates
- **THEN** the subtractive migration retains one canonical index and drops only the reviewed twin

#### Scenario: Zero scans are inconclusive

- **WHEN** an index has `idx_scan = 0` on the pre-launch database but is not a proven duplicate
- **THEN** the index remains present and the evidence ledger records the constraint or query path
  that justifies keeping it

### Requirement: Index decisions have complete, reproducible evidence

The change MUST record a timestamped baseline and post-deployment catalog/advisor result, and every
baseline zero-scan index MUST have a one-line keep/drop rationale.

#### Scenario: Baseline is reviewable

- **WHEN** a reviewer opens the MYK9-113 evidence ledger
- **THEN** it identifies the source project, inventory time, query definitions, uncovered foreign
  keys, duplicate groups, and all zero-scan index dispositions

#### Scenario: Post-deployment verification succeeds

- **WHEN** the explicitly approved migrations have been applied
- **THEN** the same inventory reports zero uncovered public foreign keys, zero exact duplicate
  groups, and records the new advisor and zero-scan counts without treating a count increase as
  proof of regression

### Requirement: Shared database changes remain operator-gated

The repository SHALL prepare and verify migrations locally without applying them to the linked
Supabase project until explicit approval is granted.

#### Scenario: Work reaches the shared-system gate

- **WHEN** source checks and the linked-project dry run pass
- **THEN** the real database push remains pending and MYK9-113 stays open until approval and
  post-push evidence are complete
