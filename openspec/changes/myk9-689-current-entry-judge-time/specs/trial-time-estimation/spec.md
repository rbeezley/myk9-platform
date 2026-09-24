## ADDED Requirements

### Requirement: Judge-time estimate uses current entry counts

The class-selection surface SHALL show a judge-time estimate only when current entry counts are loaded and contain at least one entry, SHALL compute it as the selected classes' expected entries multiplied by the template's minutes per run (`defaults.judgingTimeEstimate`), and SHALL identify the estimate as based on current entries. A template with no minutes-per-run value SHALL show no estimate. Surfaces whose classes cannot yet have entries (the show wizard, the Add Classes panel) SHALL show no estimate.

#### Scenario: Counts are unavailable or loading

- **WHEN** current entry counts are unavailable, stale, or loading
- **THEN** no judge-time estimate is shown

#### Scenario: Trial has zero entries

- **WHEN** current entry counts are loaded and total zero
- **THEN** no judge-time estimate is shown

#### Scenario: Trial has current entries

- **WHEN** current entry counts are loaded and contain entries
- **THEN** the estimate is shown as expected entries x minutes per run, with wording that it is based on current entries

#### Scenario: Counts change

- **WHEN** entries are added or withdrawn
- **THEN** the estimate is recalculated from the updated current counts
