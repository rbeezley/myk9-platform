## ADDED Requirements

### Requirement: Entry-change actions describe their actual scope

Every exhibitor entry-change action SHALL describe whether the destination can change existing classes, add new classes, or only contact the show team, and SHALL deep-link to the existing canonical surface for that action.

#### Scenario: Existing classes are editable

- **WHEN** the existing edit flow can change an exhibitor's current classes
- **THEN** the action MAY say `Change entry`
- **AND** the destination SHALL make those current class selections editable

#### Scenario: Flow only adds classes

- **WHEN** a destination can add classes but cannot change already-entered classes
- **THEN** the source action SHALL say `Add classes`, not `Add or Change Entries`
- **AND** already-entered classes SHALL explain why they are unavailable
- **AND** selecting an eligible new class SHALL enable the next step

#### Scenario: Change requires show-team help

- **WHEN** an existing entry cannot be changed in self-service
- **THEN** the page SHALL explain the restriction
- **AND** it SHALL link to the existing show-team contact path rather than present a dead edit action

### Requirement: Dog navigation restores orientation

Navigation from a dog list or Dog Details secondary view SHALL place the exhibitor at an intentional heading/focus position while preserving normal browser Back/Forward scroll restoration.

#### Scenario: Open Dog Details from dog card

- **WHEN** an exhibitor activates a dog card from the dog list
- **THEN** Dog Details SHALL start at the page heading rather than inheriting the list's scroll offset
- **AND** keyboard or assistive-technology focus SHALL move to the main heading

#### Scenario: Open a secondary deep link

- **WHEN** an exhibitor opens a Career or Records deep link
- **THEN** the selected secondary view SHALL be visible and its heading SHALL receive the appropriate focus target

#### Scenario: Browser Back

- **WHEN** an exhibitor returns with browser Back
- **THEN** the browser's saved position on the prior list SHALL be preserved

### Requirement: Exhibitor-facing product claims are real

Subscription, Pricing, Payments, and global footer content SHALL render only data, destinations, contact details, and product-status claims backed by a real source or configured destination.

#### Scenario: Subscription metrics

- **WHEN** Subscription renders account usage or billing history
- **THEN** every value SHALL come from the current exhibitor's real data
- **AND** unavailable metrics or invoice destinations SHALL be omitted rather than hardcoded

#### Scenario: Global contact and social links

- **WHEN** the global footer renders
- **THEN** every visible phone, address, help, social, privacy, or terms item SHALL have a real configured destination or verified content
- **AND** placeholder `#` links, example phone numbers, and example addresses SHALL not render

#### Scenario: Premium documentation and UI

- **WHEN** release/tracking documentation describes Premium availability
- **THEN** it SHALL agree with the five capabilities shipped in the app
- **AND** parked or future work SHALL be distinguished from currently available behavior

### Requirement: Mobile Payments keeps core details discoverable

The existing Exhibitor Payments surface SHALL keep amount, payment status, and receipt availability discoverable at a 390px viewport without requiring an unlabeled horizontal-table gesture.

#### Scenario: Payment history on phone

- **WHEN** an exhibitor views payment history at 390px width
- **THEN** each payment row or its labeled disclosure SHALL expose amount, status, and receipt availability
- **AND** disclosure and receipt controls SHALL have accessible names and at least 44px touch targets

#### Scenario: No receipt is available

- **WHEN** a payment has no real receipt destination
- **THEN** the mobile disclosure SHALL say that no receipt is available
- **AND** it SHALL NOT render a placeholder link

### Requirement: Completed journey evidence covers entitlement transitions

The remediation SHALL retain automated and browser evidence for the same exhibitor moving from free to complimentary Premium and back to free without payment or stale access.

#### Scenario: Free to complimentary Premium

- **WHEN** an authorized admin grants complimentary Premium to the test exhibitor
- **THEN** all five Premium capabilities, Subscription, and Pricing SHALL reflect the new entitlement after normal refetch or reauthentication

#### Scenario: Complimentary Premium revoked

- **WHEN** an authorized admin revokes the test exhibitor's grant
- **THEN** Premium mutations SHALL relock, free content SHALL remain available, and Subscription and Pricing SHALL return to the appropriate free state

#### Scenario: Responsive role-journey re-walk

- **WHEN** implementation is proposed complete
- **THEN** the free, Premium, and revoked journey SHALL be re-walked at phone, tablet portrait, tablet landscape, and desktop sizes
- **AND** the evidence SHALL include empty, error, invalid-input, and destructive-action recovery states
