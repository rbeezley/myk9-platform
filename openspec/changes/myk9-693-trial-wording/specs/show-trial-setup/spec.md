## ADDED Requirements

### Requirement: Trial creation communicates the next trial accurately

Authorized organizers SHALL be able to start the existing trial-creation workflow from the show Actions menu, and the workflow SHALL derive its label and next trial number from current trials on the selected show day.

#### Scenario: Empty show starts its first trial

- **WHEN** the selected show day has no trials
- **THEN** the existing workflow may use first-trial wording

#### Scenario: Existing day starts its next trial

- **WHEN** Saturday already contains Trial 1 and the organizer starts another Saturday trial
- **THEN** the workflow identifies the operation as Saturday Trial 2 and does not call it the first trial

#### Scenario: Other days do not inflate numbering

- **WHEN** trials exist on another show day but none on the selected day
- **THEN** numbering is scoped to the selected day or session
