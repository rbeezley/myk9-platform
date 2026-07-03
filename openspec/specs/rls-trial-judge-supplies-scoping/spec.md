# rls-trial-judge-supplies-scoping Specification

## Purpose
TBD - created by archiving change security-scoping-rls. Update Purpose after archive.
## Requirements
### Requirement: Trial judge supply writes are scoped to show managers
The system SHALL allow `INSERT`/`UPDATE`/`DELETE` on `trial_judge_supplies` only
for users who manage the row's trial's show — a **club manager** (club admin,
club secretary, or site admin) per `can_manage_trial`, the same CLUB-scoped
authorization the `trial_checklist_state` (087) precedent uses — not merely any
authenticated user. Show-scoped-only officials are intentionally not admitted
(SA-002/SA-007 authz decision, Option A).

#### Scenario: Club manager of the trial updates or deletes a supply row
- **WHEN** a club manager of trial A's show updates or deletes a
  `trial_judge_supplies` row scoped to trial A
- **THEN** the mutation succeeds

#### Scenario: Unrelated authenticated user cannot mutate another trial's supplies
- **WHEN** an authenticated user with no managing role on trial A updates or
  deletes a `trial_judge_supplies` row scoped to trial A
- **THEN** the mutation is denied by RLS

### Requirement: Trial judge supply reads are scoped to show managers
The system SHALL scope `SELECT` on `trial_judge_supplies` to users who manage the
row's trial's show (the same predicate as the write policies), never to every
authenticated user regardless of trial. Pre-work (SA-007) confirmed every
consumer of this table is a club-manager surface (the secretary trial-management
view and the judge-supply checklist report); no exhibitor/participant surface
reads it, so least-privilege manager-only read is correct and regresses no
consumer.

#### Scenario: Club manager of the trial reads its supply list
- **WHEN** a club manager of trial A's show queries `trial_judge_supplies` scoped
  to trial A
- **THEN** the trial's supply rows are returned

#### Scenario: Unrelated authenticated user cannot read another trial's supplies
- **WHEN** an authenticated user with no managing role on trial A queries
  `trial_judge_supplies` scoped to trial A
- **THEN** zero rows are returned

