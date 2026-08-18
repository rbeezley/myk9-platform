## ADDED Requirements

### Requirement: Operational class counts share one canonical entry row set

Show Desk, Class Details, Class Management, Entry Management, judge dashboard, judge stats, judge check-in, and ringside SHALL derive class totals and progress from the same show-scoped replication-backed entry rows whenever those surfaces can access operational entry data.

#### Scenario: One class across operational surfaces

- **WHEN** a show has a class with known confirmed, checked-in, and scored entries
- **THEN** every operational surface reports totals and progress derived from the same filtered entry IDs

#### Scenario: Count links to a filtered destination

- **WHEN** an operational count links to Entry Management or scoring
- **THEN** the destination preserves show, trial, and class scope and displays the same row count

### Requirement: Cold or failed hydration never renders a confident zero

An operational surface MUST distinguish a loaded empty class from a class whose entry rows are still loading or unavailable.

#### Scenario: Entry replica is cold

- **WHEN** class metadata is available but the show-scoped entry replica has not completed its first load
- **THEN** the surface displays loading or unavailable rather than zero entries

#### Scenario: Loaded class is genuinely empty

- **WHEN** the canonical show-entry read completes successfully and no row matches the class
- **THEN** the surface may display zero entries with an explicit empty-state explanation
