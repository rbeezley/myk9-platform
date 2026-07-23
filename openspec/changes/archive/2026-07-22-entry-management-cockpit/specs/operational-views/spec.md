## MODIFIED Requirements

### Requirement: Operational views use typed, surface-owned state

The system SHALL represent an operational view with a typed surface scope, supported filters, optional display settings, and a serialization version. Each management surface SHALL validate and apply only the state it owns. Entry Management SHALL own registration queue, Trial/Class scope, search, density, and focused-registration state; it SHALL NOT restore retired Day-of or table/card presentation modes.

#### Scenario: Entry view is applied

- **WHEN** a secretary selects a supported Entry Management preset
- **THEN** the preset applies a supported registration queue plus Trial/Class scope and density through the Entry Management URL contract
- **AND** retired work-mode, table/card, or show-day display values are not written to the URL or local preference

#### Scenario: Class view is applied

- **WHEN** a secretary selects a supported Class Management preset
- **THEN** the preset applies only valid class search/status/element/display state
- **AND** it does not modify entry, trial, or dog filters

### Requirement: Curated presets live inside existing owner surfaces

The system SHALL expose a small set of plain-language presets inside the existing Entry Management and Class Management surfaces. It MUST NOT create a new operational-views page or command center. Entry Management SHALL expose `Needs review`, `Missing information`, `Payment due`, and `All registrations`; check-in and class-progress presets SHALL remain owned by Show Desk or the supported class surface.

#### Scenario: Secretary opens an entry preset

- **WHEN** a secretary opens Entry Management
- **THEN** the compact queue selector offers `Needs review`, `Missing information`, `Payment due`, and `All registrations`
- **AND** each selection lands on the existing registration queue containing its clearing action

#### Scenario: Steward opens a class preset

- **WHEN** a steward or secretary opens the supported class management surface
- **THEN** the preset vocabulary uses show-day language such as `Not started`, `In progress`, and `Completed`
- **AND** the preset does not expose management actions the role cannot perform

### Requirement: Display presets preserve safe operational information

Display preferences SHALL use an allowlisted set of density choices and SHALL always retain Show Registration identity, current review/payment state, selection controls, and the route to focused actions. Entry Management SHALL use one responsive queue projection and SHALL NOT offer a display preset that recreates a separate Day-of, table, or card workflow.

#### Scenario: Entry Management density changes

- **WHEN** a secretary changes the Entry Management density preference
- **THEN** the same registration rows, identity, status, selection, and focus behavior remain available
- **AND** no Day-of, table, or card projection is introduced

#### Scenario: Display state changes

- **WHEN** an allowlisted display preference changes
- **THEN** no record is mutated
- **AND** the view remains usable from already-loaded or replicated data
