## ADDED Requirements

### Requirement: Judge-time estimate uses current entry counts

The class-selection surface SHALL show its unchanged judge-time calculation only when current entry counts are loaded and contain at least one entry, and SHALL identify the estimate as based on current entries.

#### Scenario: Counts are unavailable or loading

- **WHEN** current entry counts are unavailable, stale, or loading
- **THEN** no judge-time estimate is shown

#### Scenario: Trial has zero entries

- **WHEN** current entry counts are loaded and total zero
- **THEN** no judge-time estimate is shown

#### Scenario: Trial has current entries

- **WHEN** current entry counts are loaded and contain entries
- **THEN** the existing calculation is shown with wording that it is based on current entries

#### Scenario: Counts change

- **WHEN** entries are added or withdrawn
- **THEN** the estimate reacts to the updated current counts
