# admin-system-health (delta)

## ADDED Requirements

### Requirement: Ringside conflict volume is a daily health check

`system_health_probe()` SHALL report the current value of `ringside_conflict_seq`, and the check-runner SHALL emit a `ringside_conflicts` check in each snapshot whose detail records that raw counter value. The check's status SHALL derive from the delta against the previous snapshot's recorded value: `ok` below 1,000 conflicts since the prior snapshot, `warn` at or above 1,000, `fail` at or above 10,000. A missing baseline (first run, prior snapshot without the check) or a counter regression SHALL report `ok` with an explanatory note, never a false failure.

#### Scenario: Storm surfaces on the board

- **WHEN** more than 10,000 conflicts accumulate between two daily snapshots
- **THEN** the next snapshot's `ringside_conflicts` check is `fail` and `/admin/health` renders it red with the delta in its detail

#### Scenario: Quiet day is green

- **WHEN** fewer than 1,000 conflicts accumulate between snapshots
- **THEN** the check is `ok`

#### Scenario: First run has no baseline

- **WHEN** the previous snapshot has no `ringside_conflicts` check to diff against
- **THEN** the check reports `ok` with a note that a baseline was recorded, and the raw counter value is stored for the next run
