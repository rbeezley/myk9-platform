## ADDED Requirements

### Requirement: Attention reasons are canonical and typed
The system SHALL derive entry- and class-attention reasons through one shared typed classification contract used by summary counts and destination filters. The initial entry reasons SHALL distinguish pending review, missing information, and accepted entries with payment due; reopened-after-closeout SHALL remain a class-level reason.

#### Scenario: Pending entry has one review reason
- **WHEN** an entry maps to the canonical pending lifecycle state
- **THEN** the classifier returns `pending_review`
- **AND** every consumer counting pending review uses that same classification

#### Scenario: Accepted unpaid entry has payment due
- **WHEN** an accepted entry's effective payment status is pending
- **THEN** the classifier returns `payment_due`

#### Scenario: Missing information remains distinct
- **WHEN** an entry is in the canonical missing-information lifecycle state
- **THEN** the classifier returns `missing_information`
- **AND** it is not mislabeled as merely pending review

#### Scenario: Reopened class reason is not assigned to an entry
- **WHEN** a class has a non-null reopened-after-closeout timestamp
- **THEN** the class classifier returns `reopened_after_closeout`
- **AND** no individual entry is fabricated to carry that class-level reason

### Requirement: Attention links land on the canonical clearing surface
The system SHALL build attention destinations through shared route helpers that preserve show, trial, and class context and select the existing owner surface containing the clearing action.

#### Scenario: Review reason opens the matching entries
- **WHEN** a secretary activates a pending-review reason for a class
- **THEN** Entry Management opens for the same show and class with the pending-review filter applied
- **AND** the visible filtered count equals the originating reason count

#### Scenario: Payment reason opens the matching entries
- **WHEN** a secretary activates a payment-due reason for a class
- **THEN** Entry Management opens for the same show and class with payment-due filtering applied
- **AND** the visible filtered count equals the originating reason count

#### Scenario: Invalid filter parameter is normalized safely
- **WHEN** Entry Management receives an unsupported attention or payment query value
- **THEN** it normalizes to the documented default instead of presenting an unexplained empty list

### Requirement: Payment filtering is URL-addressable
Entry Management SHALL represent its effective payment filter in normalized URL search parameters so readiness links, refresh, and browser navigation preserve the selected work set.

#### Scenario: Payment filter survives refresh
- **WHEN** a secretary opens Entry Management with a supported payment filter and refreshes the page
- **THEN** the same payment filter remains active
- **AND** the same class-scoped entries remain visible

#### Scenario: Clearing payment filter removes the parameter
- **WHEN** a secretary returns the payment filter to All payments
- **THEN** the payment parameter is removed from the normalized URL
- **AND** other compatible show, trial, and class parameters remain intact

### Requirement: Summary and destination counts agree
For a fixed entry dataset and class scope, the system SHALL derive each attention summary count from the same predicate used by the linked Entry Management view.

#### Scenario: Multi-class enrollment is counted consistently
- **WHEN** one enrollment contains entries in multiple classes and the secretary views one class
- **THEN** its attention reason is counted once for that visible class entry
- **AND** the linked class-filtered Entry Management result contains the same unit once

