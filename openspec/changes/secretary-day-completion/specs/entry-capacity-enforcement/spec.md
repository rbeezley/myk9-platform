# Judge-day capacity control

## ADDED Requirements

### Requirement: Managers can consistently set and clear judge-day limits

An authenticated manager SHALL set, change or clear one live show's judge-day limit from its existing card. The change MUST atomically affect all confirmed assignments for that judge and date, preserve other judges/dates and unrelated columns, and retain the authoritative MAX merge rule and show/default fallback. Manager and exhibitor availability and entry enforcement SHALL reflect the saved limit.

#### Scenario: Set or change a day limit

- **WHEN** a manager saves a positive integer capacity
- **THEN** all matching confirmed assignments SHALL carry that value
- **AND** other dates/judges SHALL remain unchanged

#### Scenario: Clear historical inconsistent overrides

- **WHEN** a manager chooses the show default
- **THEN** every matching override SHALL be cleared together
- **AND** the authoritative limit SHALL fall back to the show setting or 125

#### Scenario: Unauthorized, invalid or missing target

- **WHEN** a caller lacks manager authority, submits an invalid capacity, or targets no confirmed assignments
- **THEN** the system SHALL reject the change without partial writes

#### Scenario: Offline or failed save

- **WHEN** the card is offline or a save fails
- **THEN** it SHALL not claim that the displayed capacity changed
- **AND** the secretary SHALL have an explicit recovery path
