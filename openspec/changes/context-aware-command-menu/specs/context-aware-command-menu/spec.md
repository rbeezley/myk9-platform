## ADDED Requirements

### Requirement: The existing command palette provides contextual navigation
The existing Command Palette SHALL provide permitted navigation and data results for the current user while preserving canonical page ownership. It SHALL identify the target surface and show context in the result label or subtitle when ambiguity exists.

#### Scenario: Secretary searches for a dog
- **WHEN** a secretary searches for a dog name
- **THEN** the palette returns permitted dog results from available data
- **AND** selecting a result navigates to the existing dog profile surface

#### Scenario: Same-named records exist in multiple shows
- **WHEN** search results contain ambiguous classes, trials, or entries
- **THEN** each result includes enough show/trial/class context to distinguish it
- **AND** selecting it opens the canonical owner surface with that context preserved

### Requirement: Contextual actions use the shared action contract
The command palette SHALL expose actions only when the current route, selection, role, permission, and entity state make them valid. It SHALL invoke the same typed action definitions and domain handlers used by row menus, inline badges, and bulk action bars.

#### Scenario: Selected entries have a check-in action
- **WHEN** an authorized secretary has selected eligible entries and opens the command palette
- **THEN** the palette may show a clearly labeled selected-entry check-in action
- **AND** executing it invokes the existing eligible-subset action handler

#### Scenario: No selection exists
- **WHEN** no entity is selected
- **THEN** selection-specific actions are absent
- **AND** the palette does not imply that a future selection exists

#### Scenario: Action is not permitted
- **WHEN** the current role cannot perform an action or the entity cannot accept its transition
- **THEN** the action is not executable
- **AND** no direct database or replication write is attempted

### Requirement: Search results are permission- and scope-safe
The palette SHALL respect existing RBAC/data-access boundaries and SHALL not expose unauthorized people, dogs, shows, trials, classes, entries, or action targets. Action commands SHALL preserve the current show scope or clearly identify a different show before navigation.

#### Scenario: User lacks people access
- **WHEN** a user without people-read permission opens the palette
- **THEN** people results and people navigation commands are absent

#### Scenario: Current show scope is active
- **WHEN** a secretary opens the palette from a show-scoped management surface
- **THEN** contextual action results use that show scope
- **AND** a cross-show target is not silently substituted

### Requirement: The palette remains bounded and useful offline
The palette SHALL search bounded loaded/cached data and SHALL not issue an unbounded network request per keystroke. When a data source is unavailable, navigation and available local actions remain usable and the limited result state is communicated plainly.

#### Scenario: Data store is loading
- **WHEN** dog, people, or show data is still loading
- **THEN** the palette shows available navigation/actions and a calm limited-results state
- **AND** it does not present loading as an application failure

#### Scenario: User is offline
- **WHEN** the user opens the palette without connectivity
- **THEN** cached/local results and navigation remain available
- **AND** the palette does not introduce a blocking offline modal

### Requirement: Keyboard shortcuts are optional and documented
The system SHALL support opening, closing, focusing, and navigating the command palette by pointer/touch and keyboard. Shortcuts SHALL be limited to a small documented vocabulary and SHALL be reflected in the keyboard-help overlay.

#### Scenario: User opens the palette by pointer
- **WHEN** a user activates the existing header search/command control
- **THEN** the palette opens without requiring a keyboard

#### Scenario: User uses a documented shortcut
- **WHEN** a user invokes a supported shortcut
- **THEN** the corresponding palette/help behavior occurs
- **AND** the shortcut is visible in the help overlay

### Requirement: Command actions preserve pending and recovery semantics
When the palette executes a mutation, it SHALL use the action’s existing pending, offline/replication, success, failure, and recovery behavior. It SHALL prevent duplicate dispatches.

#### Scenario: Command action succeeds
- **WHEN** a permitted command action completes successfully
- **THEN** the target surface reflects the result using the existing action semantics
- **AND** the user receives clear completion feedback

#### Scenario: Command action fails
- **WHEN** a command mutation fails
- **THEN** the user sees plain-language retry/recovery feedback
- **AND** the failure does not leave the palette or target row claiming an unaccepted durable state

