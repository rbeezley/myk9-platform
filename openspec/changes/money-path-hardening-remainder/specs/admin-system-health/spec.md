# admin-system-health

## ADDED Requirements

### Requirement: Health board surfaces unresolved operator alerts
The `/admin/health` board SHALL display unresolved `operator_alerts` rows (newest first) alongside the existing snapshot view, showing source, severity, title, structured detail, and age, and SHALL provide a resolve action that stamps `resolved_at`/`resolved_by`. When no unresolved alerts exist, the board SHALL show an explicit all-clear state for the alerts section.

#### Scenario: Unresolved payment alert is visible
- **WHEN** a payment failure has produced an unresolved `operator_alerts` row
- **THEN** a site admin visiting `/admin/health` sees the alert with its source, severity, and detail without querying the database

#### Scenario: Resolving clears the alert from the board
- **WHEN** the site admin resolves the alert from the board
- **THEN** the alert leaves the unresolved list and the row is retained with `resolved_at`/`resolved_by` set

#### Scenario: No alerts
- **WHEN** there are no unresolved alerts
- **THEN** the alerts section shows an explicit "no unresolved alerts" state
