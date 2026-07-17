## ADDED Requirements

### Requirement: Supported state badges are inline edit controls
When a status or check-in field is editable for the current role and surface, its badge SHALL render as an accessible button. Activating the badge SHALL open a compact anchored menu of permitted values without navigating away or opening a full dialog for a routine state choice.

#### Scenario: Secretary edits an entry check-in badge
- **WHEN** an authorized secretary activates an editable check-in badge on an entry row
- **THEN** a compact anchored menu opens beside the badge
- **AND** the menu lists the permitted check-in values with the current value identified

#### Scenario: Read-only status remains a badge
- **WHEN** the current role or lifecycle state does not permit editing a status
- **THEN** the status renders as a non-interactive badge
- **AND** it is not presented as clickable

#### Scenario: Routine choice is made
- **WHEN** the user chooses a permitted routine state from the inline menu
- **THEN** the menu closes or marks the choice pending
- **AND** the current row visibly reflects the requested state without requiring navigation

#### Scenario: Badge menu is opened by keyboard
- **WHEN** the user focuses an editable badge and presses Enter or Space
- **THEN** the same state menu opens
- **AND** focus moves into the menu with a visible focus treatment

### Requirement: Inline choices respect domain transitions and permissions
The inline menu SHALL derive its available values from the existing entity-specific permission and transition rules. It SHALL NOT invent new status values or allow a transition that the canonical mutation path would reject.

#### Scenario: Class status values are constrained
- **WHEN** a secretary opens a class status badge
- **THEN** the menu uses the existing class lifecycle/status vocabulary
- **AND** it does not expose a raw or unsupported status value

#### Scenario: Check-in values are role-specific
- **WHEN** an exhibitor, gate steward, judge, or secretary opens a check-in control
- **THEN** the menu exposes only the statuses permitted for that role and ownership scope
- **AND** staff wording is not incorrectly substituted for exhibitor self-report wording where the existing surface has role-specific copy

#### Scenario: Transition requires extra information
- **WHEN** a requested transition requires a withdrawal reason, notes, conflict resolution, or another required field
- **THEN** the inline menu routes to the existing owner dialog or workflow that collects that information
- **AND** the change does not create a new one-off dialog or silently omit the required information

### Requirement: Inline state changes use the existing persistence boundary
An inline state choice SHALL invoke the existing domain mutation or replication-backed writer for that surface. Core show-day changes SHALL remain locally responsive and replication-backed; an online-only change SHALL expose its pending/error state honestly.

#### Scenario: Entry check-in changes locally first
- **WHEN** a secretary chooses a supported entry check-in state
- **THEN** the row updates through the established optimistic check-in behavior
- **AND** persistence is delegated to `updateReplicatedCheckInStatus` or its established owner path

#### Scenario: Inline mutation fails
- **WHEN** the underlying state mutation fails
- **THEN** the row returns to its prior known state or shows the established conflict state
- **AND** the user receives plain-language retry feedback
- **AND** the failure does not leave the badge claiming a durable state that was not accepted

#### Scenario: Inline change is queued offline
- **WHEN** an offline-capable entry, class, or check-in state change is made without connectivity
- **THEN** the local state reflects the queued operation according to the existing replication contract
- **AND** the UI does not show a blocking “no internet” error for the normal offline case

### Requirement: Pending state prevents duplicate inline writes
The initiating badge/menu choice SHALL enter a pending state while an online or local mutation is being dispatched. Repeated activation SHALL NOT dispatch the same state change more than once for the same interaction.

#### Scenario: User taps a badge choice twice
- **WHEN** the user taps the same menu option twice before the mutation settles
- **THEN** the mutation is dispatched exactly once
- **AND** the badge/menu exposes that the action is pending or temporarily unavailable

#### Scenario: Background replication continues
- **WHEN** a previously accepted offline-capable choice is syncing in the background
- **THEN** the inline control does not show a blocking spinner or modal
- **AND** the app preserves the existing quiet background-sync behavior

### Requirement: Editable badges remain discoverable and non-ambiguous
Editable badges SHALL have a subtle non-hover affordance and accessible naming that communicates the field and current value. Readability, contrast, focus, and target size SHALL match `docs/INTENT.md` and existing semantic tokens.

#### Scenario: User sees an editable badge on a touch device
- **WHEN** an editable status or check-in badge renders in a management list
- **THEN** it has a minimum 44-by-44-pixel interactive target
- **AND** its label is readable outdoors without requiring hover or a tooltip

#### Scenario: Status is conveyed without color alone
- **WHEN** a badge changes from one state to another
- **THEN** the text/icon label changes with the state
- **AND** the state remains understandable in high-contrast or color-deficient viewing

#### Scenario: Routine state change completes
- **WHEN** an inline state choice succeeds
- **THEN** the changed badge and any relevant list counts update in place
- **AND** the user does not have to reopen a dialog or navigate away to confirm the result
