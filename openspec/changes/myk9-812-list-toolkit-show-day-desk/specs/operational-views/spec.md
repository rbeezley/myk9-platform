## MODIFIED Requirements

### Requirement: Curated presets live inside existing owner surfaces

The system SHALL expose a small set of plain-language presets inside the existing Entry Management and Class Management surfaces. It MUST NOT create a new operational-views page or command center. Entry Management SHALL expose `Needs review`, `Missing information`, `Payment due`, and `All registrations`; check-in and class-progress presets SHALL remain owned by Show Desk or the supported class surface. The Show Desk People roster SHALL expose `All exhibitors`, `Needs check-in`, and `Online` as curated view tabs in place of its own filter buttons. The Secretary Cockpit schedule SHALL expose `All`, `In progress`, `Needs attention`, and `Needs closeout` as curated view tabs in place of its own filter buttons.

#### Scenario: Secretary opens an entry preset

- **WHEN** a secretary opens Entry Management
- **THEN** the compact queue selector offers `Needs review`, `Missing information`, `Payment due`, and `All registrations`
- **AND** each selection lands on the existing registration queue containing its clearing action

#### Scenario: Steward opens a class preset

- **WHEN** a steward or secretary opens the supported class management surface
- **THEN** the preset vocabulary uses show-day language such as `Not started`, `In progress`, and `Completed`
- **AND** the preset does not expose management actions the role cannot perform

#### Scenario: Staff opens a People roster view

- **WHEN** staff opens the Show Desk People roster
- **THEN** the view tabs offer `All exhibitors`, `Needs check-in`, and `Online`, each carrying a live count of the rows it matches
- **AND** selecting a view narrows the roster the same way the equivalent filter button does today

#### Scenario: Secretary opens a Cockpit schedule view

- **WHEN** a secretary opens the Secretary Cockpit schedule
- **THEN** the view tabs offer `All`, `In progress`, `Needs attention`, and `Needs closeout`, each carrying a live count of the Classes it matches
- **AND** selecting a view narrows the schedule without reordering the remaining Classes (per `secretary-class-operations-cockpit`'s stable-schedule requirement)

### Requirement: Supported view state is URL-addressable

Supported filter and scope state SHALL serialize to normalized URL parameters when the owning surface supports URL state. Refreshing or sharing the URL SHALL preserve the same valid show-scoped view.

#### Scenario: Filtered entry view survives refresh

- **WHEN** a secretary opens a class-scoped “Payment due” entry view and refreshes
- **THEN** the same show, trial, class, and payment filters remain active
- **AND** the visible result remains scoped to the same owner surface

#### Scenario: Invalid view parameter is received

- **WHEN** a URL contains an unsupported preset, filter, or display value
- **THEN** the surface normalizes it to a documented safe default
- **AND** it does not render an unexplained empty list

#### Scenario: Workbench links into a view

- **WHEN** a secretary activates a Workbench readiness link
- **THEN** the destination URL contains the show context and exact supported filter needed to clear the condition
- **AND** no second list is rendered in the Workbench

#### Scenario: Cockpit schedule view survives refresh

- **WHEN** a secretary selects a Secretary Cockpit schedule view other than `All` and refreshes
- **THEN** the same view remains active
- **AND** an unsupported or stale filter value normalizes to `All` rather than showing an unexplained empty schedule

#### Scenario: People roster view is shareable by link

- **WHEN** staff selects a People roster view other than `All exhibitors` and shares or reloads the URL
- **THEN** the same view is active for an authorized user who opens that URL
- **AND** an unsupported or stale filter value normalizes to `All exhibitors`
