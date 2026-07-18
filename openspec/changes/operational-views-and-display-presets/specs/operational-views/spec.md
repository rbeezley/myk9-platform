## ADDED Requirements

### Requirement: Operational views use typed, surface-owned state
The system SHALL represent an operational view with a typed surface scope, supported filters, optional display settings, and a serialization version. Each management surface SHALL validate and apply only the state it owns.

#### Scenario: Entry view is applied
- **WHEN** a secretary selects a supported Entry Management preset
- **THEN** the preset applies attention, payment, work-mode, trial/class, and view values through the existing Entry Management filter contract
- **AND** unsupported values are not written to the URL or local preference

#### Scenario: Class view is applied
- **WHEN** a secretary selects a supported Class Management preset
- **THEN** the preset applies only valid class search/status/element/display state
- **AND** it does not modify entry, trial, or dog filters

### Requirement: Curated presets live inside existing owner surfaces
The system SHALL expose a small set of plain-language presets inside the existing Entry Management and Class Management surfaces. It MUST NOT create a new operational-views page or command center.

#### Scenario: Secretary opens an entry preset
- **WHEN** a secretary opens Entry Management
- **THEN** presets such as “Needs review,” “Payment due,” and “Needs check-in” are available in the existing view/filter controls
- **AND** each preset lands on the existing list that contains the clearing action

#### Scenario: Steward opens a class preset
- **WHEN** a steward or secretary opens the supported class management surface
- **THEN** the preset vocabulary uses show-day language such as “Not started,” “In progress,” and “Completed”
- **AND** the preset does not expose management actions the role cannot perform

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

### Requirement: Filtered views can be handed off by copied link
The Entry Management and Class Management view headers SHALL provide a copy-link affordance that copies the current normalized view URL. A copied URL SHALL round-trip through the owning surface's normalizer so the recipient sees the same show-scoped view, subject to their own permissions.

#### Scenario: Secretary copies a filtered view link
- **WHEN** a secretary activates the copy-link affordance on a filtered Entry Management or Class Management view
- **THEN** the copied URL contains only normalized, supported parameters for that surface
- **AND** opening the URL reproduces the same filters, scope, and display state for an authorized user

#### Scenario: Clipboard access is unavailable
- **WHEN** the browser clipboard API is unavailable or the copy attempt fails
- **THEN** the surface offers the normalized URL for manual copying (for example, a selectable field)
- **AND** the failure does not interrupt the current view or selection state

#### Scenario: Copied link is opened by a user without access
- **WHEN** a copied view URL is opened by a user who lacks access to the show or surface
- **THEN** the existing authorization boundary applies
- **AND** no filtered data is exposed by the URL alone

### Requirement: Personal saved views are explicit and local
The system SHALL save validated view definitions as personal device-local preferences. A personal saved view SHALL be labeled as personal/local, namespaced by authenticated user and owning surface, and SHALL NOT be presented as a shared workspace view. Restoring a view SHALL revalidate its user, surface, serialization version, and current show scope before applying any filters.

#### Scenario: Secretary saves a view
- **WHEN** a secretary saves a supported filter/display combination
- **THEN** the definition is stored under a key namespaced by authenticated user and owning surface with its show scope recorded
- **AND** reapplying it restores only validated state for the same user, surface, and current show

#### Scenario: Another user signs in on the same device
- **WHEN** the authenticated user changes on a shared show tablet
- **THEN** saved views belonging to the prior user are not listed or restored
- **AND** in-memory saved-view state from the prior account is cleared

#### Scenario: Saved view belongs to another show
- **WHEN** a saved view contains a show, trial, or class scope that is invalid for the current show
- **THEN** the saved view is rejected and removed or reset according to the documented recovery policy
- **AND** curated presets and the current safe default remain available

#### Scenario: Local saved view is unavailable
- **WHEN** local storage is unavailable, cleared, or contains invalid data
- **THEN** curated presets and URL-based views remain usable
- **AND** the surface does not block core management work

### Requirement: Display presets preserve safe operational information
Display presets SHALL use an allowlisted set of columns, grouping, and density choices. They SHALL always retain object identity, current state, selection controls, and the single-object action menu.

#### Scenario: Show-day display is selected
- **WHEN** a secretary selects a show-day display preset
- **THEN** armband, dog, class, and check-in information receive priority
- **AND** row actions and current state remain visible and accessible

#### Scenario: Display state changes
- **WHEN** a display preset or grouping changes
- **THEN** no record is mutated
- **AND** the view remains usable from already-loaded or replicated data

### Requirement: View changes clear active selection
Applying a preset, changing a filter, changing tabs, or changing entity scope SHALL clear active row selection before another bulk action can be executed.

#### Scenario: Selected entries switch to a preset
- **WHEN** entries are selected and the secretary changes to another operational preset
- **THEN** selection is cleared
- **AND** the bulk action bar no longer offers actions for the former selection

#### Scenario: View changes while offline
- **WHEN** a secretary changes a supported view while offline
- **THEN** the local/replicated data is filtered without a blocking network error
- **AND** the surface does not claim that unavailable data is zero
