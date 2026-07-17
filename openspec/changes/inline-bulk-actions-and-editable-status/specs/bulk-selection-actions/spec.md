## ADDED Requirements

### Requirement: Management lists support scoped multi-selection
Supported myK9Show management lists SHALL allow an authorized user to select individual visible rows and select all currently visible rows. Selection SHALL be scoped to one entity type and the current loaded/filtered list view.

#### Scenario: Secretary selects individual rows
- **WHEN** an authorized secretary checks two visible entry or class rows
- **THEN** both rows show a selected state that is not conveyed by color alone
- **AND** the action bar reports the exact selected count

#### Scenario: Secretary selects all visible rows
- **WHEN** an authorized secretary activates “Select all visible”
- **THEN** every currently visible loaded row is selected
- **AND** rows hidden by search, filter, tab, or entity scope are not selected

#### Scenario: Header selection is partial
- **WHEN** some but not all visible rows are selected
- **THEN** the header selection control exposes an indeterminate state
- **AND** activating it follows the documented select-all-visible behavior

#### Scenario: View scope changes
- **WHEN** the user changes search, filters, tabs, or the entity scope while rows are selected
- **THEN** the selection is cleared before another bulk action can be applied
- **AND** no mutation is dispatched as a side effect of changing the view

#### Scenario: Selected row leaves the loaded list
- **WHEN** a selected row is removed from the loaded data after a refresh or realtime update
- **THEN** its ID is pruned from the selection
- **AND** the selected count no longer includes that row

### Requirement: The action bar is contextual and entity-owned
When one or more rows are selected, the existing management surface SHALL show a compact action bar with the selected count, an Actions control, and a clear-selection control. The action list SHALL come from the current entity surface’s typed action registry and SHALL be filtered by the user’s permission and the selected rows’ state.

#### Scenario: No rows are selected
- **WHEN** the management list has no selected rows
- **THEN** the bulk action bar is not rendered
- **AND** the list retains its normal uncluttered controls

#### Scenario: Entry actions are shown on Entry Management
- **WHEN** an authorized secretary selects eligible entry rows on Entry Management
- **THEN** the Actions menu exposes only entry actions supported by the existing entry-management handlers
- **AND** it does not expose class, trial, dog, or people actions

#### Scenario: Class actions are shown on Class Management
- **WHEN** an authorized secretary selects class rows on Class Management
- **THEN** the Actions menu exposes class actions supported by the existing class mutation path
- **AND** it does not create a second class-management page or command center

#### Scenario: Permission does not allow an action
- **WHEN** the current role cannot perform a candidate action
- **THEN** that action is not executable
- **AND** the user can determine why it is unavailable from visible or accessible explanatory text when the action is shown

### Requirement: Single-object actions reuse the existing row-menu pattern
Single-object actions SHALL render through the existing accessible three-dot row-menu pattern, including the shared `RowActionMenu` used by entry and class row action components. The change MUST NOT add a second per-row Actions button, a duplicate overflow menu, or a new detail surface solely to host actions.

#### Scenario: Entry has single-object actions
- **WHEN** an authorized user opens the actions control for one entry
- **THEN** the existing entry row action menu presents only actions relevant to that entry
- **AND** those actions use the same domain handlers available to bulk actions where the operation supports both contexts

#### Scenario: Class has single-object actions
- **WHEN** an authorized user opens the actions control for one class
- **THEN** the class row uses the canonical row-menu pattern rather than a second bespoke menu implementation
- **AND** class-specific actions remain owned by the existing class surface and mutation path

#### Scenario: Frequent state change is available inline
- **WHEN** a single row exposes an editable status or check-in badge
- **THEN** the badge remains the direct path for that frequent state change
- **AND** the user is not required to open the three-dot menu for the routine change

#### Scenario: Row menu is used on a touch device
- **WHEN** the single-object actions control renders at a tablet viewport
- **THEN** it has a minimum 44-by-44-pixel target and an accessible label naming the object
- **AND** its discoverability does not depend on hover

### Requirement: The requested entity categories share the same interaction contract
The system SHALL use the same selection and contextual-action contract for existing management surfaces for Entries, Classes, Trials, Dogs, and People. Each category SHALL either expose actions through its canonical owner surface or document that no safe canonical action exists; the implementation MUST NOT create a new page solely to provide parity.

#### Scenario: Entries and Classes adopt the first rollout
- **WHEN** the first rollout is enabled
- **THEN** Entry Management and Class Management use the shared selection/action behavior
- **AND** their existing domain-specific actions remain owned by their existing mutation paths

#### Scenario: Trials, Dogs, and People adopt the follow-on rollout
- **WHEN** a canonical Trial, Dog, or People management surface and safe state/action writer have been verified
- **THEN** that surface uses the same selection bar and contextual action contract
- **AND** it does not introduce a second management page or mixed-entity selection

#### Scenario: A requested category lacks a safe canonical action
- **WHEN** inventory finds no verified state/action writer for a requested entity category
- **THEN** unsupported actions are omitted and the limitation is documented
- **AND** the system does not add a direct write or a duplicate surface merely to make the menu look complete

### Requirement: Bulk action scope is explicit
Each bulk action SHALL declare whether it applies to all selected rows or an eligible subset. An all-selected action SHALL NOT run when any selected row is ineligible. An eligible-subset action SHALL state the eligible count before execution and in its result.

#### Scenario: All-selected action has an ineligible row
- **WHEN** an all-selected action is requested and one selected row cannot accept the action
- **THEN** the action is disabled
- **AND** the UI explains that all selected rows must support the action
- **AND** no selected row is mutated

#### Scenario: Eligible-subset action runs
- **WHEN** an eligible-subset action is requested for eight selected entries and six are eligible
- **THEN** the action identifies that six entries will be updated before it runs
- **AND** the two ineligible entries remain unchanged

#### Scenario: Destructive bulk action is requested
- **WHEN** a destructive bulk action is selected
- **THEN** it uses the existing destructive action treatment and domain safeguard
- **AND** the shared selection layer does not silently convert it into an eligible-subset operation

### Requirement: Bulk mutations use existing domain writers
Bulk actions SHALL invoke the existing entity-specific mutation or replication-backed writer through an adapter. The shared action bar SHALL NOT write directly to Supabase, bypass RBAC, or introduce a second persistence path for entries, classes, or check-in.

#### Scenario: Entry check-in is bulk-updated
- **WHEN** a secretary applies a supported bulk check-in action to selected entries
- **THEN** the action delegates to the established check-in mutation path
- **AND** the local list updates using the same optimistic/replication semantics as the existing single-entry action

#### Scenario: Class status is bulk-updated
- **WHEN** a secretary applies a supported bulk class-status action
- **THEN** the action delegates to the existing class mutation path
- **AND** class lifecycle presentation continues to use canonical class status rules

#### Scenario: No safe writer exists
- **WHEN** a surface has no verified canonical writer for a proposed bulk action
- **THEN** that action is not exposed
- **AND** the implementation does not add a direct online write solely to support the menu

### Requirement: Bulk outcomes are honest and recoverable
The system SHALL prevent duplicate bulk dispatches while an action is pending and SHALL report successful, failed, and skipped outcomes in plain language. Failed rows SHALL remain retryable when the underlying surface can safely retry them.

#### Scenario: Bulk action succeeds
- **WHEN** every eligible selected row is updated successfully
- **THEN** the action bar exits its pending state
- **AND** the user sees the exact number of updated rows
- **AND** the selection is cleared

#### Scenario: Bulk action partially fails
- **WHEN** some selected row mutations succeed and others fail
- **THEN** the user sees the exact succeeded and failed counts
- **AND** failed rows remain selected or otherwise directly retryable
- **AND** successful rows are not presented as failed

#### Scenario: User activates an action twice
- **WHEN** the user activates the same bulk action again before the first execution settles
- **THEN** the second activation is ignored or disabled
- **AND** each eligible row receives at most one dispatch for that execution

#### Scenario: Core show-day bulk action runs offline
- **WHEN** a supported entry, class, or check-in bulk action is performed while offline
- **THEN** it uses the established local/replication-backed writer
- **AND** the user receives the existing quiet offline/queued treatment rather than a false network error

### Requirement: Bulk selection is accessible on touch and keyboard
Selection controls and the action bar SHALL meet the app’s accessibility and show-day interaction rules: minimum 44-by-44-pixel targets, visible keyboard focus, readable labels, and no hover-only or gesture-only operation.

#### Scenario: Secretary uses a tablet
- **WHEN** the action bar and row selection controls render at a show-day tablet viewport
- **THEN** the controls remain reachable and usable without hover
- **AND** the selected state is communicated through text, structure, or accessible state in addition to color

#### Scenario: Secretary uses the keyboard
- **WHEN** the user tabs to a row checkbox or the Actions control
- **THEN** focus is visible
- **AND** Space/Enter activates the control according to its accessible role
