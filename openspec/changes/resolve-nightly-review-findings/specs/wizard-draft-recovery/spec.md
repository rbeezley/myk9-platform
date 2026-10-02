# Spec Delta

## Purpose

Preserve existing launch-critical workflow correctness and recovery at the wizard-draft-recovery boundary.

## ADDED Requirements

### Requirement: Persisted trial schedules survive the field migration

The wizard SHALL preserve a valid previous draft's trial day, start time, explicit names, judge and class links when loading the current schema; invalid/missing schedule values MUST require input rather than receive fabricated defaults.

#### Scenario: Legacy schedule

- **WHEN** a version-1 draft carries its local combined date/time
- **THEN** current date/time fields display and validate the same wall-clock schedule without re-entry

#### Scenario: Current or invalid draft

- **WHEN** a current-shape draft or malformed prior schedule is loaded
- **THEN** current fields remain intact and invalid values remain visibly incomplete
