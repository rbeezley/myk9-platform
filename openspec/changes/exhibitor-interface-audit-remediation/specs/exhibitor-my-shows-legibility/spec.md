# Delta: exhibitor-my-shows-legibility

## ADDED Requirements

### Requirement: One card per online order

The My Shows page SHALL render one card per registration (the online-order unit: one registration per handler per show, identified by `registrationId`), with every dog entered under that registration grouped on the same card. Entries with no `registrationId` SHALL retain the previous show-plus-dog grouping so no entry disappears. Regrouping SHALL conserve the total set of classes: every class visible before the change remains visible after it.

#### Scenario: Multi-dog order renders as one card

- **WHEN** an exhibitor's registration for a show contains entries for two dogs
- **THEN** My Shows renders exactly one card for that registration listing both dogs with their classes, not one card per dog

#### Scenario: Unregistered entry still appears

- **WHEN** an entry row has a null `registrationId` (e.g., secretary-entered)
- **THEN** it renders as its own show-plus-dog card and no class is lost from the page

### Requirement: Dog items wrap at five per row

Within an order card, dog items SHALL lay out in a wrapping grid with at most five items per row and SHALL NOT introduce horizontal scrolling at any viewport width.

#### Scenario: Six-dog order wraps

- **WHEN** an order card contains six dogs at a desktop viewport
- **THEN** dogs render five in the first row and one in the second, with no horizontal scrollbar on the card

## MODIFIED Requirements

### Requirement: Entry card leads with summary and single next action

Each order card SHALL render an always-visible summary band containing status, the dog identities on the order, show date, location, and exactly one primary next action, with per-class detail, confirmation number, and result detail collapsed behind a labeled "Show details" control. The next action SHALL be derived over all classes on the order by precedence: finish payment (order unpaid), then check-in (when any class is check-in eligible), then view show. Activating check-in from the summary SHALL use the existing check-in mutation path.

#### Scenario: Details toggle is accessible

- **WHEN** the "Show details" control renders
- **THEN** it exposes `aria-expanded` state, references its panel, and has at least a 44px hit area

#### Scenario: Pending entry reassures

- **WHEN** an order's status is pending review
- **THEN** the summary band includes a one-line reassurance that the show secretary is reviewing the entry

#### Scenario: Card collapsed by default

- **WHEN** an order card renders
- **THEN** status, dogs, show date, location, and the next action are visible without expanding, and class rows and confirmation number are hidden until "Show details" is activated

#### Scenario: Check-in surfaced as next action

- **WHEN** an order is fully paid and any of its classes is check-in eligible
- **THEN** the summary band's primary action is check-in and it performs the same mutation as the in-details check-in control

#### Scenario: Close date only while actionable

- **WHEN** an order's editing window has closed
- **THEN** the "Entries close" date is not shown in the summary band (it remains available inside details)
