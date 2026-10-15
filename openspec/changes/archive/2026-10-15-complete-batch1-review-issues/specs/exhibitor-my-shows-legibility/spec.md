## ADDED Requirements

### Requirement: Unreadable entry identity is explained truthfully

An exhibitor's entry whose show or class cannot be read SHALL remain visible with truthful unpublished or unavailable copy, its dog and payment state, and no invented schedule date. Actions requiring unreadable identity SHALL remain unavailable.

#### Scenario: Draft show and class

- **WHEN** an exhibitor reads their paid entry in an unreadable draft show with no class relation
- **THEN** the card says Show not published yet and Class not published yet, and does not show Unknown Show, Unknown Class or today's date

### Requirement: Dog class rows use chronological schedule order

My Shows, People at show and the show page SHALL order a dog's class rows by trial calendar day and class start time. Same-day 9:00 AM precedes 10:00 AM; untimed rows follow timed rows. All three surfaces SHALL use one ordering rule.

#### Scenario: Same-day mixed time formats

- **WHEN** a dog has 9:00 AM, 10:00 AM and untimed classes on one day
- **THEN** all three surfaces show that chronological order, including after replica hydration
