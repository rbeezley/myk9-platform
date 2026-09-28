## MODIFIED Requirements

### Requirement: Scoped multi-selection is uniform across management surfaces

The system SHALL provide multi-selection on Entry Management, Class Management, admin Users, dogs, people management surfaces, the Self check-in tool's class list, and the Results Control page's class list, with: a header checkbox supporting select-all-visible and indeterminate state — or, where the surface's rows are grouped by trial (the Self check-in tool and Results Control page), an equivalent per-trial "select all" control with the same select-all-visible and indeterminate behavior scoped to that trial's rows — per-row checkboxes, and automatic pruning of selections that leave the current filtered scope. Entry Management selection SHALL use its visible Show Registration row unit and SHALL expand selected groups to their child Entry mutation targets only when an action is dispatched. Selection SHALL NOT span entity types.

#### Scenario: Select all visible

- **WHEN** the user activates the header checkbox with no rows selected
- **THEN** all rows in the current filtered result set become selected
- **AND** Entry Management selects each visible Show Registration once rather than each displayed child Entry

#### Scenario: Indeterminate header state

- **WHEN** some but not all visible rows are selected
- **THEN** the header checkbox renders the indeterminate state, and activating it selects the remaining visible rows or clears per the shared `useBulkSelection` contract

#### Scenario: Filter change prunes stale selections

- **WHEN** the user changes filters or search such that selected rows are no longer in the visible result set
- **THEN** those rows are removed from the selection and cannot be affected by a subsequent bulk action

#### Scenario: Class Management sheds its local selection

- **WHEN** Class Management renders after migration
- **THEN** selection behaves per this requirement (header checkbox, indeterminate, pruning) and the previous "Select all filtered" button and hand-rolled selection state are removed

#### Scenario: Self check-in and Results Control already share the selection contract

- **WHEN** the Self check-in tool or the Results Control page renders its class list
- **THEN** selection is driven by the same `useBulkSelection` hook as every other surface named in this requirement, with per-show pruning on show change
- **AND** the per-trial "select all" control selects or deselects exactly that trial's visible classes, leaving classes in other trials untouched

### Requirement: Contextual bulk actions use a compact floating toolbar

When selection is active on Entry Management, the Self check-in tool, or the Results Control page, the system SHALL present a bounded floating toolbar above the bottom edge rather than a full-width fixed footer or an inline bar rendered in normal document flow. The toolbar SHALL keep selected count, primary eligible action, overflow actions, and Clear together; SHALL avoid obscuring content; and SHALL remain usable above mobile safe-area/navigation controls.

#### Scenario: Registration selection shows both count units

- **WHEN** three Show Registrations containing eleven child Entries are selected
- **THEN** the floating toolbar shows `3 registrations · 11 Entries`
- **AND** action labels disclose the exact eligible subset before dispatch

#### Scenario: First checkbox enters selection mode

- **WHEN** the first row checkbox is selected
- **THEN** the floating toolbar appears immediately as one compact visual group
- **AND** clicking a row without its checkbox continues to change focus rather than bulk selection

#### Scenario: Selection toolbar renders on a narrow viewport

- **WHEN** selection is active on a tablet or mobile-width layout
- **THEN** the toolbar remains inset and reachable above safe-area/navigation controls
- **AND** the last visible queue row is not permanently obscured

#### Scenario: Self check-in bulk actions float instead of docking inline

- **WHEN** one or more classes are selected in the Self check-in tool
- **THEN** the Enable/Disable self check-in actions appear in the shared floating toolbar instead of the tool's own inline bar
- **AND** the toolbar disappears when the selection is cleared

#### Scenario: Results Control bulk actions float instead of a fixed full-width footer

- **WHEN** one or more classes are selected on the Results Control page
- **THEN** Apply Preset, Release Results, and Hide Results appear in the shared floating toolbar instead of the page's own fixed bottom bar
- **AND** the toolbar's eligibility rules (Release requires at least one manual-release-timing class; Hide Results requires at least one released class) are unchanged
