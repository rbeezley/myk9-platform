## ADDED Requirements

### Requirement: Review states use one canonical vocabulary

All secretary-facing renderings of a registration or entry review state SHALL source their label from one shared mapping module, with states rendered as nouns/adjectives and menu commands as verbs.

#### Scenario: Accepted state reads identically everywhere

- **WHEN** a registration's entries are accepted
- **THEN** the queue row, the focused-card badge, and any state summary all render the same label ("Accepted")
- **AND** no surface renders "Reviewed" for that state

#### Scenario: Commands are verbs, states are not

- **WHEN** the status-change menu renders
- **THEN** every state-changing item is phrased as a command (e.g., "Accept", "Reject", "Mark missing information")
- **AND** badges and rows never use command phrasing

### Requirement: Status menu marks the current state

The per-entry status-change menu SHALL indicate which status the entry currently has.

#### Scenario: Current status is marked and inert

- **WHEN** a secretary opens the change-status menu for a pending entry
- **THEN** the pending item is visibly marked as current
- **AND** activating it performs no status change

### Requirement: Reverting a scored entry requires confirmation

The system SHALL require an explicit confirmation before changing a completed (scored) entry to a pre-scoring status, and the confirmation SHALL name the consequence.

#### Scenario: Completed entry revert prompts

- **WHEN** a secretary chooses a pre-scoring status (accepted, pending, or missing information) for a completed entry
- **THEN** a confirmation dialog explains the entry has a recorded result and what changing it means
- **AND** the status changes only after the secretary confirms

#### Scenario: Cancel leaves the entry untouched

- **WHEN** the secretary cancels the confirmation
- **THEN** the entry keeps its completed status
- **AND** no side effects occur

#### Scenario: Non-scored transitions stay one-click

- **WHEN** a secretary changes the status of an entry that has no recorded result
- **THEN** no confirmation dialog is shown
