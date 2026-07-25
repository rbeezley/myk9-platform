## ADDED Requirements

### Requirement: Every shipped Premium dog capability is discoverable

The Dog Details workspace SHALL expose Title Progress, Statistics, Health Records, Training Journal, and Pedigree to an active account-Premium exhibitor through the Career or Records group, and SHALL expose a labeled locked preview or read-only downgrade state with an upgrade path to a free exhibitor without adding a separate Premium page.

#### Scenario: Active Premium exhibitor discovers all capabilities

- **WHEN** an exhibitor with active Premium access opens Dog Details
- **THEN** Career SHALL expose Title Progress and Statistics
- **AND** Records SHALL expose Health Records, Training Journal, and Pedigree

#### Scenario: Free exhibitor understands locked capabilities

- **WHEN** a free exhibitor opens Career or Records
- **THEN** every unavailable Premium secondary view SHALL have a plain-language label and one shared route to the existing Pricing page
- **AND** the page SHALL NOT render five competing top-level lock tabs

#### Scenario: Downgraded exhibitor has saved records

- **WHEN** a free, expired, or revoked exhibitor has existing Health, Training, or Pedigree data
- **THEN** the corresponding Records views SHALL allow read and delete access to owned records
- **AND** existing Health or Training export/report actions SHALL remain available where already supported
- **AND** create and edit controls SHALL explain that account Premium is required

### Requirement: Premium record forms validate before mutation

Pedigree and Health record forms SHALL validate required and conditional fields before invoking a mutation, SHALL use the form's real submit path, and SHALL remain open with entered values preserved when validation or persistence fails.

#### Scenario: Empty required Pedigree form

- **WHEN** an exhibitor submits a Pedigree ancestor form without the required dog name
- **THEN** no create or update mutation SHALL run
- **AND** the form SHALL remain open and identify the required field

#### Scenario: Empty required Health form

- **WHEN** an exhibitor submits a Health record form without its required values
- **THEN** no create or update mutation SHALL run
- **AND** the form SHALL remain open and identify the required fields

#### Scenario: Record mutation fails

- **WHEN** a valid Premium record mutation is rejected or times out
- **THEN** the dialog SHALL remain open with the exhibitor's values intact
- **AND** an announced error SHALL explain that the record was not saved and offer retry

#### Scenario: Record mutation succeeds

- **WHEN** a valid Premium record mutation succeeds
- **THEN** the dialog SHALL close only after success
- **AND** the saved record SHALL appear from the canonical query result

### Requirement: Health calendar dates preserve the entered day

Health dates that represent calendar days SHALL be parsed, stored, filtered, and displayed without timezone conversion changing the day.

#### Scenario: Vaccination date in a negative UTC offset

- **WHEN** an exhibitor in `America/Chicago` saves vaccination date `2026-07-23`
- **THEN** every Health view and edit form SHALL display July 23, 2026
- **AND** no view SHALL display July 22 because of UTC parsing

#### Scenario: Date boundary

- **WHEN** a saved calendar date is the first or last day of a month or year
- **THEN** filtering and display SHALL keep the same calendar month, day, and year

### Requirement: Health filters are functional and explain empty results

Health search, type, and year controls SHALL be controlled by real filter state and SHALL filter the currently loaded record set consistently.

#### Scenario: Search by visible record text

- **WHEN** an exhibitor enters text matching a Health record name, provider, or other indexed visible field
- **THEN** matching records SHALL remain and nonmatching records SHALL be excluded

#### Scenario: Filter by year

- **WHEN** an exhibitor selects a year with saved Health records
- **THEN** only records whose calendar date belongs to that year SHALL render

#### Scenario: No records match filters

- **WHEN** Health records exist but none match the active filters
- **THEN** the view SHALL show a filter-specific empty state with a Clear filters action
- **AND** it SHALL NOT imply that the dog has no Health records

### Requirement: Premium records fit their content container

Health and Pedigree SHALL remain readable and operable without horizontal clipping at 390x844 phone, 834x1112 tablet portrait, tablet landscape, and 1280x800 desktop viewports, including when Dog Details has a sidebar.

#### Scenario: Narrow Pedigree container

- **WHEN** the Pedigree content container cannot fit the visual tree
- **THEN** ancestors SHALL render as ordered Parents and Grandparents relationship groups
- **AND** every add, view, edit, and delete action SHALL remain available without horizontal scrolling

#### Scenario: Wide Pedigree container

- **WHEN** the Pedigree content container can fit the visual tree at readable sizes
- **THEN** the tree MAY render while preserving explicit relationship labels and accessible actions

#### Scenario: Health actions in tablet landscape

- **WHEN** Health renders in a constrained main column at tablet landscape width
- **THEN** headings, filters, and actions SHALL wrap or reflow within the content container
- **AND** no control or primary text SHALL overlap or clip

### Requirement: Training actions are accessible and recoverable

Training Journal form controls and rich-text actions SHALL have programmatic labels, and deletion SHALL require confirmation or provide an immediate undo path tied to mutation success.

#### Scenario: Keyboard and screen-reader operation

- **WHEN** an exhibitor operates Training Journal without a pointer
- **THEN** every field, formatting control, save action, and delete action SHALL have an accessible name and visible focus
- **AND** formatting toggles SHALL expose their selected state

#### Scenario: Delete a training entry

- **WHEN** an exhibitor activates Delete on a training entry
- **THEN** the system SHALL identify the entry being deleted and require confirmation or expose an immediate Undo action
- **AND** a failed delete SHALL retain or restore the entry and announce the failure

### Requirement: Title Progress and Statistics show source-grounded states

Title Progress and Statistics SHALL derive displayed user metrics from the existing title engine and saved competition/result data, and SHALL provide distinct loading, error/retry, empty, and populated states.

#### Scenario: Dog has no qualifying results

- **WHEN** a Premium dog has no qualifying saved results
- **THEN** Title Progress and Statistics SHALL show feature-specific empty guidance
- **AND** they SHALL NOT render demonstration values as the dog's data

#### Scenario: Derived data fails to load

- **WHEN** title or statistics data cannot be loaded
- **THEN** the affected view SHALL show a non-blaming error with Retry
- **AND** the other Dog Details views SHALL remain navigable

#### Scenario: Dog has qualifying results

- **WHEN** qualifying scored or saved competition results exist
- **THEN** Title Progress and Statistics SHALL reflect the canonical title/statistics calculations for those results
