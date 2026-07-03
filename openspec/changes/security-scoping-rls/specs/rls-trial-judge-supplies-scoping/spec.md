## ADDED Requirements

### Requirement: Trial judge supply writes are scoped to show officials
The system SHALL allow `INSERT`/`UPDATE`/`DELETE` on `trial_judge_supplies` only
for users who manage the row's trial/show, mirroring the `trial_checklist_state`
scoping predicate, not merely any authenticated user.

#### Scenario: Official of the trial updates or deletes a supply row
- **WHEN** an official of trial A updates or deletes a `trial_judge_supplies` row
  scoped to trial A
- **THEN** the mutation succeeds

#### Scenario: Unrelated authenticated user cannot mutate another trial's supplies
- **WHEN** an authenticated user with no official role on trial A updates or
  deletes a `trial_judge_supplies` row scoped to trial A
- **THEN** the mutation is denied by RLS

### Requirement: Trial judge supply reads are scoped to the trial's participants
The system SHALL scope `SELECT` on `trial_judge_supplies` to at least the trial's
show participants, never to every authenticated user regardless of trial.

#### Scenario: Show participant reads their trial's supply list
- **WHEN** an authenticated participant of trial A queries `trial_judge_supplies`
  scoped to trial A
- **THEN** the trial's supply rows are returned

#### Scenario: Unrelated authenticated user cannot read another trial's supplies
- **WHEN** an authenticated user with no participation in trial A queries
  `trial_judge_supplies` scoped to trial A
- **THEN** zero rows are returned
