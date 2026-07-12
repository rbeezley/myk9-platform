## ADDED Requirements

### Requirement: Class completion counts only expected, accounted-for entries
The server-side class-status derivation SHALL treat an entry as *expected to score* only when its `entry_status` is not `scratched`, `withdrawn`, or `cancelled` and its `check_in_status` is not `pulled`. Among expected entries, an entry SHALL be *accounted-for* when `is_scored = true` OR its `result_status` is a non-scored terminal outcome (`absent` or `excused`). A class SHALL become `completed` only when it has at least one expected entry and every expected entry is accounted-for. A class with zero expected entries SHALL remain `upcoming` (never auto-complete).

#### Scenario: Scratched dog no longer blocks completion
- **WHEN** a class has three entries, two scored qualified and one `scratched`, and no other entries remain unscored
- **THEN** the class derives to `completed` (the scratched entry is not counted as expected), instead of staying `in_progress` forever

#### Scenario: No-show recorded as absent completes the class
- **WHEN** every expected entry in a class is either `is_scored` or has `result_status = 'absent'`/`'excused'`
- **THEN** the class derives to `completed`

#### Scenario: Empty class stays upcoming
- **WHEN** a class has zero entries, or all its entries are scratched/withdrawn/pulled
- **THEN** the derived status is `upcoming` and the class never auto-completes

#### Scenario: First scoring event moves the class to in progress
- **WHEN** the first expected entry in an `upcoming` class is scored
- **THEN** the class derives to `in_progress`

### Requirement: Manual status override survives recompute
A class SHALL carry a `status_source` marker of `derived` or `manual` (default `derived`). When `status_source = 'manual'`, the server-side derivation SHALL NOT overwrite the class `status`, while still refreshing display counts such as `scored_count`. The manual "Mark Complete" and "Mark Started" actions SHALL set `status_source = 'manual'` atomically with the status they write through the same offline-first replicated write path. This v1 guarantee covers the normal queued-mutation sync path; preserving explicit status intent when a pending payload is rebuilt after token advancement is tracked separately.

#### Scenario: Manual Mark Complete is not flipped back by later scoring
- **WHEN** a secretary marks a partially-scored class `completed` (setting `status_source = 'manual'`) and a further entry is then scored
- **THEN** the class stays `completed` and the derivation leaves its status untouched, though `scored_count` still updates

#### Scenario: Manual override set offline is honored by normal queued sync
- **WHEN** a secretary marks a class complete while offline and the queued mutation later syncs without token-advance payload rebuilding
- **THEN** the synced class retains `status_source = 'manual'` and the server derivation does not overwrite its status

#### Scenario: Derived classes are unaffected
- **WHEN** a class has `status_source = 'derived'` and scoring changes
- **THEN** the derivation recomputes and writes its status normally

### Requirement: Late entry reopens a closed class and flags attention
Adding an expected entry to a class that is currently `completed` or manually closed SHALL flip the class back to `in_progress`, reset `status_source` to `derived`, and stamp `reopened_after_closeout_at`. The show-map attention surface SHALL treat a non-null `reopened_after_closeout_at` as a class-level attention reason so the secretary is notified that new work appeared under a class they had closed. The stamp SHALL be cleared when the class next legitimately reaches `completed`.

#### Scenario: Late entry reopens a completed class
- **WHEN** an expected entry is added to a class whose status is `completed`
- **THEN** the class becomes `in_progress`, `status_source` becomes `derived`, and `reopened_after_closeout_at` is set to the current time

#### Scenario: Late entry clears a manual override
- **WHEN** an expected entry is added to a class that a secretary had manually marked complete (`status_source = 'manual'`)
- **THEN** the manual override is cleared (`status_source = 'derived'`) and the class reopens to `in_progress`

#### Scenario: Reopened class surfaces attention
- **WHEN** a class has a non-null `reopened_after_closeout_at`
- **THEN** the show-map attention count for that class node reflects the reopened class as needing attention

### Requirement: Derivation extends the single existing scoring authority
The derivation SHALL remain the sole database-side writer of `classes.status` for scoring, implemented by extending the existing `refresh_class_scoring_state()` function and its trigger handler rather than introducing a second trigger that also writes `classes.status`. The trigger SHALL fire on entry INSERT and DELETE in addition to the existing scoring-column UPDATE set.

#### Scenario: Every scoring path re-derives status
- **WHEN** an entry is scored through the `ringside_update_entry` RPC, or through a direct manager entries update
- **THEN** the same derivation runs and writes a consistent class status, because both are entry UPDATEs caught by the one trigger

#### Scenario: Entry insertion re-derives status
- **WHEN** an entry is inserted into a class
- **THEN** the derivation runs (the trigger fires on INSERT, not only UPDATE)

### Requirement: Existing classes are reconciled on deploy
The deploying migration SHALL run a one-time recompute of the derived status for existing classes so the corrected completeness definition reaches classes currently stuck `in_progress` behind a scratch or no-show, SHALL skip classes with `status_source = 'manual'`, and SHALL prevent the class-status push webhook from firing for the backfill's status changes.

#### Scenario: Stuck class is completed by backfill
- **WHEN** the migration runs and an existing `in_progress` class has all expected entries accounted-for (its only unscored entry is scratched)
- **THEN** the backfill recomputes the class to `completed`

#### Scenario: Backfill does not spam push notifications
- **WHEN** the backfill flips many classes' status
- **THEN** the class-status push webhook does not fire for those backfill-driven changes

#### Scenario: Backfill preserves manual overrides
- **WHEN** the backfill runs over a class with `status_source = 'manual'`
- **THEN** that class's status is left unchanged
