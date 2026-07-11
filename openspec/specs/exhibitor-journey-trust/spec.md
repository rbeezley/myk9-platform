# exhibitor-journey-trust

## Purpose

Defines the trust contract myK9Show keeps with elderly and low-tech-confidence exhibitors across
their end-to-end journey: closed-entry gates that don't dangle a normal entry path after a show
closes, entry-change guidance once the edit window passes, exhibitor-first show-day navigation that
leads with the exhibitor's own dogs instead of ringside administration lists, plain-language
check-in choices, dog-profile edit paths that stay simple and never surface raw `NaN` or accidental
zero values, onboarding that preserves saved progress across reloads, and browser-audit evidence
retained for each remediation slice. Introduced by `exhibitor-elderly-ux-remediation`.

## Requirements

### Requirement: Closed entry paths are blocked before selection

The system SHALL prevent closed shows from presenting a normal exhibitor entry path on public show
surfaces or direct registration wizard URLs.

#### Scenario: Closed show landing

- **WHEN** an exhibitor views a show whose entries are closed
- **THEN** the primary entry CTA SHALL be replaced with closed-entry guidance
- **AND** the page SHALL provide a direct recovery action to contact or message the show team

#### Scenario: Direct wizard URL after close

- **WHEN** an exhibitor opens a registration wizard URL for a show whose entries are closed
- **THEN** the wizard SHALL show a closed-entry screen before dog or class selection
- **AND** the wizard SHALL provide a direct recovery action to contact or message the show team

### Requirement: Post-close entry changes explain the next step

The system SHALL explain why normal entry editing is unavailable after the edit deadline and SHALL
provide one obvious next action.

#### Scenario: Editable entry remains editable

- **WHEN** an entry is still within the allowed edit window
- **THEN** the entry card SHALL show the existing edit action

#### Scenario: Closed entry edit unavailable

- **WHEN** an entry is past the allowed edit window
- **THEN** the entry card SHALL show plain-language guidance that entries are closed
- **AND** the entry card SHALL provide an action to message or contact the show team

### Requirement: Exhibitor show day starts with owned entries

The system SHALL default exhibitor show-day navigation to the exhibitor's own dogs and practical
next actions before class-wide or ringside administration lists.

#### Scenario: Exhibitor has entries today

- **WHEN** an exhibitor with entries opens show day for the show
- **THEN** the first view SHALL list the exhibitor's entered dogs
- **AND** each listed dog SHALL show available class, armband or confirmation, check-in state, and
  next practical action

#### Scenario: Running order not posted

- **WHEN** the exhibitor has entries but class or running-order data is unavailable
- **THEN** the page SHALL NOT show an empty state that implies the exhibitor has no entries
- **AND** the page SHALL explain that the running order is not posted yet

#### Scenario: Full class list remains available

- **WHEN** an exhibitor wants the broader class or ringside list
- **THEN** the show-day surface SHALL keep that list available as secondary navigation

### Requirement: Exhibitor check-in language is plain

The system SHALL display exhibitor-facing check-in choices in plain language while preserving
internal operational statuses for staff workflows.

#### Scenario: Exhibitor check-in choices

- **WHEN** an exhibitor opens check-in controls
- **THEN** the choices SHALL use plain labels such as "I am here", "I am not there yet", and "I
  have a conflict - tell the secretary"
- **AND** the system SHALL map those choices to existing internal check-in statuses

#### Scenario: Staff status precision remains

- **WHEN** a secretary, judge, or gate steward views operational check-in state
- **THEN** the staff-facing view SHALL keep the existing operational status precision

### Requirement: Dog profile edits stay simple and trustworthy

The system SHALL keep dog profile correction paths simple and SHALL never display invalid optional
measurements as `NaN` or accidental zero values.

#### Scenario: Optional measurements are blank

- **WHEN** dog height or weight is blank or invalid
- **THEN** dog detail surfaces SHALL display blank or "Not recorded" style text
- **AND** the system SHALL NOT display `NaN` or unintended zero measurements

#### Scenario: Simple dog correction

- **WHEN** an exhibitor edits basic dog facts
- **THEN** the form SHALL prioritize basic fields ahead of advanced optional details
- **AND** the user SHALL be able to complete a basic correction without scanning premium or advanced
  fields

#### Scenario: Registration uncertainty

- **WHEN** an exhibitor is unsure about organization, breed, AKC/PAL/ILP, or mixed-breed
  registration details
- **THEN** the dog profile surface SHALL provide concise guidance near the relevant fields

### Requirement: Onboarding reloads preserve confidence

The system SHALL avoid surprising exhibitors with an unexplained earlier onboarding step after
saved progress or completion.

#### Scenario: Onboarding completion reload

- **WHEN** an exhibitor completes onboarding and reloads or returns to the app
- **THEN** the app SHALL NOT restart them at an earlier step without explanation

#### Scenario: Partial setup remains

- **WHEN** onboarding saved progress but additional required setup remains
- **THEN** the app SHALL show saved progress and the missing setup item in plain language
- **AND** the primary action SHALL be framed as finishing setup rather than restarting

### Requirement: Elderly exhibitor audit evidence is retained

The system SHALL retain test and browser-audit evidence for the remediation slices before
considering the plan complete.

#### Scenario: Focused automated coverage

- **WHEN** a remediation slice changes a helper, hook, component, or user-facing state
- **THEN** focused automated tests SHALL cover the changed behavior before the task is marked
  complete

#### Scenario: Browser re-walk

- **WHEN** the critical contradictions are removed and seed data includes a currently open show
- **THEN** the elderly exhibitor browser walk SHALL be repeated using visible labels and no
  developer-only route knowledge
