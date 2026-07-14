## ADDED Requirements

### Requirement: Missed health snapshots create deduplicated durable alerts

The system SHALL create at most one unresolved `operator_alerts` row for each missed expected UTC daily-health run. The alert SHALL use a stable source and dedupe key, contain no secret values, and remain visible on `/admin/health`. Resolving an alert SHALL allow a later distinct missed run to create a new alert.

#### Scenario: First missed run creates an alert

- **WHEN** the watchdog finds no snapshot for the expected UTC run window
- **THEN** one unresolved warning or error alert is persisted with the missed run date and latest snapshot time

#### Scenario: Repeated watchdog execution is idempotent

- **WHEN** the watchdog runs more than once for the same missed UTC run
- **THEN** exactly one unresolved alert exists for that run

#### Scenario: Later recurrence alerts again

- **WHEN** an earlier missed-run alert is resolved and a later UTC run is missed
- **THEN** a new unresolved alert with the later run's dedupe key is persisted
