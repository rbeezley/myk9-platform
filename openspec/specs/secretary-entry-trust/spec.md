# secretary-entry-trust Specification

## Purpose
Secretary mail-in and on-behalf entries must preserve the facts the secretary
just entered as they move from registration into Entry Management. Handler
identity, payment state, receipt routing, correction actions, and nearby
confidence copy should make Entry Management feel trustworthy on show day.

## Requirements
### Requirement: Secretary mail-in entries preserve selected handler identity
The system SHALL preserve and display the handler selected during secretary/on-behalf registration instead of replacing it with the signed-in secretary.

#### Scenario: Selected handler displays in Entry Management
- **WHEN** a secretary submits a mail-in/on-behalf entry for an exhibitor-owned dog and selects a non-secretary handler
- **THEN** Entry Management displays the selected handler for the created entry
- **AND** it does not fall back to the signed-in secretary when the selected handler identity is available

#### Scenario: Joined handler person wins over legacy handler text
- **WHEN** Entry Management reads an entry with both a joined handler person and legacy handler text
- **THEN** the displayed handler comes from the joined handler person

#### Scenario: Legacy handler text remains visible
- **WHEN** Entry Management reads a legacy entry with handler text but no joined handler person
- **THEN** the displayed handler uses the legacy handler text

#### Scenario: Missing handler has a plain fallback
- **WHEN** Entry Management reads an entry with no joined handler person and no legacy handler text
- **THEN** the displayed handler is `Not specified`

### Requirement: Enrollment-backed payment display uses enrollment authority
The system SHALL use the enrollment payment state as the display and filter source of truth for enrollment-backed Entry Management groups.

#### Scenario: Secretary recorded payment displays as paid
- **WHEN** a secretary submits a mail-in/on-behalf entry with a recorded check, cash, waived, or already-received payment and the resulting enrollment is paid
- **THEN** the Entry Management enrollment card displays the group as paid
- **AND** the card does not show `Payment Due` for that paid enrollment group

#### Scenario: Payment filters match visible enrollment status
- **WHEN** an enrollment-backed group is displayed as paid, partially paid, refunded, or due
- **THEN** Entry Management payment filters and counts classify the group by that same effective payment status

#### Scenario: Standalone entry payment display remains entry-based
- **WHEN** Entry Management displays an entry that is not backed by an enrollment group
- **THEN** payment display and filters use that entry's effective payment fields

### Requirement: Secretary receipts return to Entry Management
The system SHALL make secretary/on-behalf registration receipts use secretary-specific copy and return the user to Entry Management as the primary next action.

#### Scenario: Secretary receipt uses mail-in copy
- **WHEN** a secretary completes a mail-in/on-behalf registration
- **THEN** the receipt headline says `Mail-in entry submitted`
- **AND** it does not use exhibitor-first copy such as `Your entry is submitted`

#### Scenario: Secretary receipt primary action returns to entries
- **WHEN** a secretary completes a mail-in/on-behalf registration
- **THEN** the primary receipt action is `Return to Entry Management`
- **AND** activating it navigates to the existing Entry Management surface for the show

#### Scenario: Exhibitor receipt copy is preserved
- **WHEN** an exhibitor completes a self-service registration
- **THEN** the receipt keeps the exhibitor-oriented next steps appropriate to self-entry

### Requirement: Entry Management offers one plain correction action
The system SHALL expose one clearly named `Edit entry` action from existing Entry Management row/card actions for corrections that are safe for the entry's state and permissions.

#### Scenario: Edit entry action is available when editable
- **WHEN** a secretary opens the action menu for an entry that can still be corrected
- **THEN** the menu includes an `Edit entry` action
- **AND** the action opens the existing correction dialog or adapted `EntryEditDialog`

#### Scenario: Handler correction updates the visible row
- **WHEN** a secretary changes an editable entry's handler through `Edit entry` and saves successfully
- **THEN** the Entry Management row/card updates to show the corrected handler

#### Scenario: Failed correction does not imply success
- **WHEN** a secretary saves an entry correction and the mutation fails
- **THEN** the row/card keeps its previous visible values
- **AND** the secretary sees plain retry-oriented feedback

#### Scenario: Non-editable entry explains why
- **WHEN** a secretary opens actions for an entry that can no longer be edited
- **THEN** the edit action is disabled or unavailable with plain copy explaining why

### Requirement: Secretary confidence copy stays task-specific
The system SHALL keep existing secretary surfaces task-specific and avoid confusing duplicate commit actions.

#### Scenario: Armband next-number action is not a commit action
- **WHEN** a secretary opens the armband dialog
- **THEN** the next-number helper action is labeled `Use next available`
- **AND** the only commit action is labeled `Assign armband`

#### Scenario: Empty Entry Management links to mail-in entry
- **WHEN** a secretary opens Entry Management for a show with no visible entries
- **THEN** the empty state includes an inline `Add mail-in entry` action that starts the existing secretary registration flow

#### Scenario: Add Person create mode uses create title
- **WHEN** a secretary opens the Add Person panel in create mode
- **THEN** the panel title is `Add Person`
- **AND** it does not say `Edit User`

#### Scenario: Club edit restriction uses plain permissions copy
- **WHEN** a secretary sees a club surface they are not allowed to edit
- **THEN** the surface shows a plain permissions message instead of an editable-looking dead end
