## ADDED Requirements

### Requirement: People roster agrees with Show Desk entry state

The system SHALL keep the People at show roster entry facts consistent with the Show Desk entry, Show Map, and closeout summaries for the same show scope.

#### Scenario: Roster and Show Desk counts use the same show scope

- **WHEN** a staff user opens Show Desk and the People at show tool for the same show
- **THEN** the show-level entry counts, Show Map entry counts, closeout entry counts, and People at show class summaries are derived from the same show-scoped entry set
- **AND** the UI does not simultaneously report zero show entries while listing exhibitors with class entries for that same scope

#### Scenario: Intentional count differences are labeled

- **WHEN** the People at show tool intentionally includes rows outside the Show Map or closeout count scope
- **THEN** the roster labels that scope difference in plain secretary-facing language
- **AND** the Show Desk summary does not imply the excluded rows are missing

#### Scenario: Count derivation remains covered

- **WHEN** the People at show roster derivation changes
- **THEN** focused tests cover the relationship between roster rows and the Show Desk entry/count summaries
- **AND** a seeded show with roster-visible exhibitors cannot regress to a zero-entry Show Desk summary without a failing test
