## ADDED Requirements

### Requirement: My Entries card has a scan-first hierarchy

The exhibitor My Entries page SHALL render each entry card with a clear scan order: show/dog identity, primary entry/payment state, essential show metadata, entered classes, then contextual actions. My Entries cards SHALL NOT render the four-step lifecycle strip; they SHALL communicate current state through direct status labels/chips such as "Pending Review", "Accepted", "Waitlist", "Completed", "Payment Due", or paid/pay-at-show equivalents.

#### Scenario: Pending payment entry is immediately understandable

- **WHEN** an exhibitor views an upcoming entry that has pending payment
- **THEN** the card's top section communicates the payment/action state before the class list
- **AND** the "Finish Payment" affordance remains available from the card without navigating to another page first

#### Scenario: Accepted paid entry has no lifecycle strip

- **WHEN** an exhibitor views an accepted paid upcoming entry
- **THEN** the card shows the accepted/paid state without rendering the four-step lifecycle strip
- **AND** the show name, dog name, confirmation/armband signal, date/location, and class count remain visible

#### Scenario: Pending review and payment due are direct labels

- **WHEN** an exhibitor views an entry awaiting review with unpaid online payment
- **THEN** the card shows direct current-status labels for review and payment
- **AND** it does not show numbered lifecycle steps for submitted, review, accepted, or paid

### Requirement: Entered classes are displayed as compact rows

The exhibitor My Entries card SHALL display classes in a compact, stable row/list treatment suitable for scanning multiple classes for one dog at one show. Each class row SHALL preserve class name, trial/date context when available, result/check-in state when available, and relevant class-level actions.

#### Scenario: Multi-class entry remains compact

- **WHEN** a dog is entered in five classes for one show
- **THEN** the card displays five class rows without turning each class into a large nested card
- **AND** each row keeps at least a 44px target for interactive controls

#### Scenario: Long class names do not break layout

- **WHEN** a class name, trial number, or jump-height label is long
- **THEN** the row truncates or wraps professionally without overlapping check-in, result, or action controls

### Requirement: Scan controls filter existing entries only

Any search, dog filter, or sort affordance added to My Entries SHALL operate only on the already-loaded entry list and SHALL NOT introduce a new route, duplicate dog-management surface, or new online-only core data fetch.

#### Scenario: User narrows by dog or text

- **WHEN** an exhibitor narrows the list by dog name, show name, class name, or confirmation number
- **THEN** the existing entry cards are filtered in place
- **AND** clearing the control restores the same tab-filtered list

#### Scenario: No filtered matches

- **WHEN** a filter produces no matching entries
- **THEN** the page shows a filter-specific empty state
- **AND** it does not imply the exhibitor has no entries overall

### Requirement: Existing deep links remain canonical

The My Entries page SHALL keep deeper tasks linked to their existing canonical surfaces instead of duplicating them on the card.

#### Scenario: Show details are needed

- **WHEN** an exhibitor needs full show information beyond the card summary
- **THEN** the card links to the existing Show Details route for that show

#### Scenario: Show-day execution is needed

- **WHEN** the existing Show Today banner applies
- **THEN** the page keeps `/at-show/:showId` as the show-day destination
- **AND** the card redesign does not add a competing show-day page or panel

### Requirement: Implementation preserves accessibility and launch reliability

The scanability changes SHALL preserve keyboard access, visible focus states, large touch targets, error/empty/loading states, and current payment/check-in/result/edit/receipt behavior.

#### Scenario: Keyboard user reaches all actions

- **WHEN** a keyboard user tabs through a card with payment, check-in, result, edit, run-order, show, and receipt affordances
- **THEN** each interactive element is focusable, labeled, and visibly focused

#### Scenario: Existing behavior is retained

- **WHEN** focused My Entries tests run after the redesign
- **THEN** existing behavior for grouping classes, payment hrefs, result reveal prompts, post-deadline help, and tab filtering remains covered and passing
