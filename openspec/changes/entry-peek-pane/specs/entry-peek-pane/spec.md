## ADDED Requirements

### Requirement: Entry detail opens as a context-preserving side pane

Entry Management SHALL present single-entry detail in a side pane that keeps the entry list, active filters, scroll position, and bulk selection visible and interactive behind it. The pane SHALL render as a right-anchored panel on desktop and full-width on tablet/narrow viewports using a single component, not two separately rendered copies.

#### Scenario: Opening an entry keeps the list in place

- **WHEN** a secretary opens an entry from a filtered Entry Management list
- **THEN** the pane appears with the entry's detail
- **AND** the list behind it remains visible with its filters, scroll position, and any bulk selection unchanged

#### Scenario: Tablet renders one full-width pane

- **WHEN** the pane is opened on a tablet/narrow viewport
- **THEN** the same pane component renders full-width
- **AND** no second, CSS-hidden copy of the entry detail is present in the DOM

### Requirement: Open entry is reflected in normalized URL state

The open entry SHALL be represented by an `entry` URL parameter handled by the Entry Management search-parameter normalizer, scoped to the current show. Refresh, back/forward, and copied links SHALL restore the same peeked entry. An `entry` value that is invalid or outside the current show scope SHALL be normalized away and leave the pane closed; it SHALL NOT expose a cross-show entry.

#### Scenario: Refresh restores the peeked entry

- **WHEN** an entry is open and the secretary refreshes the page
- **THEN** the pane reopens on the same entry with the same underlying list filters

#### Scenario: Invalid entry parameter is ignored

- **WHEN** the URL contains an `entry` value that does not exist in or belong to the current show scope
- **THEN** the pane stays closed
- **AND** no cross-show entry is displayed

### Requirement: Previous/next walks the current result set

The pane SHALL provide previous and next controls that move to the adjacent entry in the surface's current filtered and ordered result set without closing the pane. The controls SHALL derive their order from the already-loaded/replicated list, requiring no new online query, and SHALL disable at the ends of the set rather than wrapping.

#### Scenario: Next moves in visible order

- **WHEN** the secretary activates "next" while an entry is open
- **THEN** the pane shows the entry that follows the current one in the visible filtered order
- **AND** the pane remains open

#### Scenario: Ends of the set disable navigation

- **WHEN** the open entry is the last entry in the current result set
- **THEN** the "next" control is disabled and does not wrap to the first entry

#### Scenario: Navigation works offline

- **WHEN** the device is offline and the list is already loaded
- **THEN** previous/next still moves between entries without a network request

### Requirement: Pane reuses shared entry actions

Actions and inline status editing available in the pane SHALL come from the shared entry action definitions and inline-editing contract, not a duplicated mutation path. Role/permission checks, transition rules, and the offline/replication-backed write path SHALL be unchanged from the row and bulk contexts.

#### Scenario: Status change from the pane uses the shared path

- **WHEN** a secretary changes an entry's status from within the pane
- **THEN** the change is applied through the same replication-backed mutation used by the row action
- **AND** the same role/permission and transition rules are enforced

### Requirement: Keyboard focus is preserved across open and close

Opening the pane SHALL move focus into it and trap focus while open. Closing the pane or pressing Escape SHALL return focus to the row that opened it. Moving between entries with previous/next SHALL keep focus within the pane.

#### Scenario: Escape returns focus to the originating row

- **WHEN** the pane is open and the secretary presses Escape
- **THEN** the pane closes
- **AND** keyboard focus returns to the entry row that opened it

### Requirement: EntryEditDialog is removed from Entry Management only

Entry Management SHALL NOT render `EntryEditDialog`; the pane is its single entry-detail path. The `EntryEditDialog` component SHALL remain available for the exhibitor My Entries surface, which is out of scope for this change; the component SHALL NOT be deleted while that surface still depends on it.

#### Scenario: Entry Management no longer uses the dialog

- **WHEN** an entry is opened from Entry Management
- **THEN** the side pane is shown and `EntryEditDialog` is not rendered on that surface

#### Scenario: Exhibitor My Entries is unaffected

- **WHEN** an exhibitor opens an entry from My Entries
- **THEN** the existing `EntryEditDialog` behavior is unchanged
