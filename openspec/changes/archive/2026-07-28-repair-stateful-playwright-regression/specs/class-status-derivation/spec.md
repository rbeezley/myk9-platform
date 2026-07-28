## MODIFIED Requirements

### Requirement: Derivation extends the single existing scoring authority

The derivation SHALL remain the sole database-side writer of `classes.status` for scoring, implemented by extending the existing `refresh_class_scoring_state()` function and its trigger handler rather than introducing a second trigger that also writes `classes.status`. The trigger SHALL fire on entry INSERT and DELETE in addition to the existing scoring-column UPDATE set. When derivation clears placements for a non-completed class, it SHALL update only entries whose `final_placement` is non-null so the refresh does not issue a nested same-row no-op update for an already-clear placement.

#### Scenario: Every scoring path re-derives status

- **WHEN** an entry is scored through the `ringside_update_entry` RPC, or through a direct manager entries update
- **THEN** the same derivation runs and writes a consistent class status, because both are entry UPDATEs caught by the one trigger

#### Scenario: Entry insertion re-derives status

- **WHEN** an entry is inserted into a class
- **THEN** the derivation runs (the trigger fires on INSERT, not only UPDATE)

#### Scenario: Check-in leaves an already-clear placement untouched

- **WHEN** an unscored entry with `final_placement IS NULL` is checked into a derived-status class that remains non-completed
- **THEN** class status is refreshed without issuing a nested no-op placement update against that entry, and the check-in RPC completes
