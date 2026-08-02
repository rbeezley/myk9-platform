## ADDED Requirements

### Requirement: Judge scoring actions are explicit and keyboard-operable

The existing ringside class entry list SHALL expose a visible, semantically interactive Score or Resume action for every scoreable entry, and the action MUST be reachable and operable by keyboard without duplicating the scoresheet route or mutation path.

#### Scenario: Judge advances from the entry list by keyboard

- **WHEN** a judge focuses a pending or in-ring entry and activates its Score or Resume action with the keyboard
- **THEN** the existing assignment preflight runs once and the existing scoresheet route opens for that entry

#### Scenario: Nested entry controls remain independent

- **WHEN** a judge activates a favorite, reorder, or overflow control inside an entry row
- **THEN** that control performs only its named action and does not also open the scoresheet

### Requirement: Frequent judge actions meet the touch target contract

Frequent actions on `/judge/*` and `/at-show` SHALL measure at least 44 by 44 CSS pixels, with 48 pixels preferred at tablet landscape widths, without introducing horizontal overflow or avoidable scrolling.

#### Scenario: Tablet landscape action sizing

- **WHEN** the judge dashboard and active class are rendered at 1024x768
- **THEN** Start, Continue, View Results, Open Ringside, Score/Resume, and overflow actions meet the touch target contract

#### Scenario: Mobile and desktop retain usable layout

- **WHEN** the same surfaces render at 390x844 and 1440x900
- **THEN** the larger targets remain visible without horizontal overflow or clipped labels

### Requirement: Judge context uses human-readable labels

Default judge and ringside workflow UI SHALL identify assignments using human-readable show, trial, ring, and class labels and MUST NOT expose raw class UUIDs as primary content.

#### Scenario: Check-in assignment without ring number

- **WHEN** an assignment lacks a ring number
- **THEN** the check-in card uses the class name and an “Assigned class” fallback rather than the class UUID

#### Scenario: Diagnostic identifier is needed

- **WHEN** support diagnostics expose an internal class ID
- **THEN** the ID is separated from the default judge workflow and clearly labeled as diagnostic information
