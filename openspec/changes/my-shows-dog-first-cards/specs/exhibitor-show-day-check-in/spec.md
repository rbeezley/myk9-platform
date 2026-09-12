## ADDED Requirements

### Requirement: Day-gated batch check-in on the dog card

A dog card SHALL offer one primary button, "Check in for <weekday>", when and only when: the show is not past, and there is at least one class on that dog whose trial date is **today in the trial's timezone** (resolved through `getTrialTimezone`), that is check-in eligible by the existing `isClassCheckInEligible` rule, that has no check-in state yet, and whose class-scoped self-check-in toggle is enabled. Activating it SHALL call the existing per-class check-in mutation once for each such class with status `checked-in`, in class order, and SHALL NOT touch classes on any other day or classes that already carry a state. The button SHALL NOT render before the trial day, for a later day's classes, or once every eligible class for today is checked in.

#### Scenario: Night before

- **WHEN** it is 11pm on Friday in the trial's timezone and the dog's classes are all on Saturday
- **THEN** the dog card renders no check-in button and each Saturday class row reads "opens Saturday"

#### Scenario: Trial day, two classes

- **WHEN** it is Saturday in the trial's timezone and the dog has two Saturday classes with no check-in state
- **THEN** the button reads "Check in for Saturday" and activating it issues exactly two check-in mutations, one per class, with status checked-in

#### Scenario: Mixed days

- **WHEN** the dog has one Saturday class and one Sunday class and it is Saturday
- **THEN** activating the button checks in the Saturday class only, and the Sunday row still reads "opens Sunday"

#### Scenario: Already set states are left alone

- **WHEN** one of today's classes is already at gate and another has no state
- **THEN** activating the button checks in only the class with no state and leaves the at-gate class unchanged

#### Scenario: Timezone is the trial's, not the device's

- **WHEN** the device clock says Saturday 00:30 Eastern and the trial is in America/Los_Angeles where it is still Friday
- **THEN** the dog card renders no check-in button

#### Scenario: Self-check-in disabled

- **WHEN** the secretary has disabled self-check-in for a class
- **THEN** that class is excluded from the batch and from the row-level control, matching today's cascade

### Requirement: Per-class check-in controls on the class row

Each class row SHALL carry its own control in the state column. A class with no check-in state that is eligible today SHALL show a "Check in" link that checks in that class alone through the same mutation. A class that carries a state (checked in, at gate, come to gate, conflict, pulled) SHALL show that state followed by a "change" link that opens the existing `CheckInStatusDialog` for that class, with the same options the dialog offers today (at gate, conflict, pulled, notes). A class with a result SHALL show the result instead of a control. A class on a future day SHALL read "opens <weekday>" with no control. A class on a past day with no result and no state SHALL read "not run".

#### Scenario: Row-level check in

- **WHEN** the exhibitor activates "Check in" on one class row
- **THEN** exactly one check-in mutation is issued for that class and the row updates to "checked in · change"

#### Scenario: Change opens the existing dialog

- **WHEN** the exhibitor activates "change" on a checked-in class
- **THEN** the existing check-in status dialog opens for that class with its current status preselected

#### Scenario: Conflict is visible without expanding anything

- **WHEN** a class is marked conflict
- **THEN** the row shows "conflict" in the warning colour with a "change" link, and the dog chip reads "Conflict"

### Requirement: Check-in controls meet show-day accessibility

Every check-in control (the day button, row links, and "change" links) SHALL have a hit area of at least 44px in height, SHALL be operable by keyboard, and SHALL announce the dog and class it acts on to assistive technology.

#### Scenario: Row link hit area

- **WHEN** a class row renders a "Check in" or "change" link
- **THEN** its hit area is at least 44px tall and its accessible name includes the class name
