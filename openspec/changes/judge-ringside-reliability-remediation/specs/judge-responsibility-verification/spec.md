## ADDED Requirements

### Requirement: Judge authorization evidence uses a single-role actor

Judge responsibility verification SHALL use a deterministic actor whose active role inventory contains judge and no broader manager, secretary, steward, or site-wide role. The same fixture set SHALL include assigned, unassigned, and no-assignment subjects.

#### Scenario: Guarded E2E account setup is reconciled repeatedly

- **WHEN** the approved guarded E2E account setup runs against accounts containing stale role grants
- **THEN** its deterministic reconciliation leaves the canonical judge with exactly the declared judge role and reports any mismatch

#### Scenario: Assigned and unassigned class access

- **WHEN** the judge opens an assigned class and then an unassigned class
- **THEN** the assigned class is available for scoring and the unassigned class is denied with a plain-language explanation before any scoring side effect

#### Scenario: Judge has no assignments

- **WHEN** a judge-only actor has no active assignments
- **THEN** the judge surfaces show a clear no-assignment explanation and expose no unrelated show or class

#### Scenario: Results are not yet authorized for disclosure

- **WHEN** the judge-only actor or an unrelated actor opens an unreleased class result path
- **THEN** the system exposes only the result fields allowed for that role and release state, including no private hide-count or premature result detail
