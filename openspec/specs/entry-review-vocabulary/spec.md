# entry-review-vocabulary Specification

## Purpose
One canonical vocabulary for entry review states across the secretary cockpit (states as nouns, menu commands as verbs, sourced from reviewStateLabels.ts), with the status menu marking the current state and a confirmation guard before reverting a scored entry to a pre-scoring status.
## Requirements
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

### Requirement: Exhibitor-facing review states use the canonical vocabulary

Exhibitor-facing renderings of an entry's review state SHALL source their label from the same shared mapping module used by secretary surfaces, rather than deriving labels independently per surface. Where the exhibitor-facing wording must differ from the secretary-facing wording for the same underlying state, that wording SHALL be defined in the shared module as an explicit exhibitor variant, not invented at the call site.

#### Scenario: One state reads consistently across exhibitor surfaces

- **WHEN** the same entry's review state renders on the My Shows entry card and on the show-detail run schedule
- **THEN** both render the same exhibitor-facing label for that state

#### Scenario: Labels come from the shared module

- **WHEN** an exhibitor-facing review-state label is rendered
- **THEN** its text originates from the shared review-state mapping module

### Requirement: An entry awaiting review is never described as not accepted

An entry whose review is still pending SHALL NOT be labelled with wording that denotes refusal. Wording denoting refusal SHALL be reserved for entries that have actually been declined, and SHALL be accompanied by a reason or a next step.

#### Scenario: Pending entry on the run schedule

- **WHEN** an entry is awaiting secretary review and appears on the show-detail run schedule
- **THEN** its label conveys that review is pending
- **AND** it does not read as "Not accepted" or other refusal wording

#### Scenario: Consistency with the entry card

- **WHEN** the same entry renders on the My Shows entry card as awaiting review
- **THEN** the run-schedule label conveys the same meaning, so the two surfaces cannot be read as contradicting each other

#### Scenario: A genuinely declined entry

- **WHEN** an entry has actually been declined by the show
- **THEN** it is labelled with refusal wording
- **AND** a reason or next step accompanies it
