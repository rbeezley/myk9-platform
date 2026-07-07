## ADDED Requirements

### Requirement: Canonical entry start routes
The system SHALL route entry-start actions through the existing registration wizard, cart, Show Desk, and confirmation surfaces instead of introducing a duplicate entry or payment workflow.

#### Scenario: Exhibitor starts self-entry
- **WHEN** an exhibitor chooses to enter a show for their own dogs
- **THEN** the system SHALL route them to `/shows/:showId/register`
- **AND** the system SHALL use the exhibitor self-service workflow mode

#### Scenario: Secretary starts on-behalf entry
- **WHEN** a secretary chooses to add entries for another exhibitor, a paper entry, or a mail-in entry
- **THEN** the system SHALL route them to `/secretary/register/:showId`
- **AND** the system SHALL use a secretary workflow mode with on-behalf controls

#### Scenario: Show Desk starts late entry
- **WHEN** a secretary starts a late or day-of entry from Show Desk
- **THEN** the system SHALL route them to `/secretary/register/:showId?source=show-desk&entryMode=late`
- **AND** the system SHALL show late-entry context without creating a separate late-entry form

### Requirement: Secretary add-entries decision point
The system SHALL provide one secretary-facing add-entries decision point that asks whose dog is being entered and then links to the canonical workflow for that answer.

#### Scenario: Secretary chooses own dogs
- **WHEN** a secretary chooses to enter their own dogs from the add-entries decision point
- **THEN** the system SHALL link to the exhibitor self-service route for the current show
- **AND** the system SHALL not duplicate dog, class, handler, or payment collection in the decision point

#### Scenario: Secretary chooses another exhibitor
- **WHEN** a secretary chooses to enter another exhibitor's dog from the add-entries decision point
- **THEN** the system SHALL link to the secretary registration route for the current show
- **AND** the system SHALL not duplicate dog, class, handler, or payment collection in the decision point

### Requirement: Audience-scoped dog selection
The system SHALL scope dog selection tools by workflow audience so exhibitors do not see secretary-grade all-dog tools and secretaries retain the tools needed to record on-behalf entries.

#### Scenario: Exhibitor self-service dog scope
- **WHEN** the registration wizard is in exhibitor self-service mode
- **THEN** the system SHALL only use dogs owned by the logged-in exhibitor
- **AND** the system SHALL not show all-dog search, bulk selection, or create-new exhibitor controls

#### Scenario: Secretary dog scope
- **WHEN** the registration wizard is in secretary or admin mode
- **THEN** the system SHALL show dog selection with advanced all-dog search
- **AND** the system SHALL allow permitted bulk selection and create-new tools

#### Scenario: Multiple-owner selection guard
- **WHEN** selected dogs resolve to multiple owners or to no owner
- **THEN** the system MUST block continuation to payment
- **AND** the system SHALL explain the issue in plain language

### Requirement: Payment rail boundaries
The system SHALL offer payment methods that match the active workflow and shall guard submission against invalid payment rails.

#### Scenario: Exhibitor card checkout
- **WHEN** an exhibitor self-service entry has fees due and online card checkout is available
- **THEN** the system SHALL default or guide the exhibitor to secure Stripe-hosted card checkout
- **AND** the system SHALL not collect card details inside myK9Show

#### Scenario: Secretary on-behalf payment methods
- **WHEN** the wizard is in secretary or admin mode
- **THEN** the system SHALL not render card checkout as a selectable payment method
- **AND** the system SHALL allow only configured on-behalf methods such as check, cash, waived, or already-received payment

#### Scenario: Crafted on-behalf card attempt
- **WHEN** a loaded draft, crafted URL, or stale state attempts to submit a secretary/admin entry with card checkout
- **THEN** the system MUST reject the submission before checkout handoff
- **AND** the system SHALL tell the user that online card checkout is only for exhibitors paying for their own entries

#### Scenario: Payment method persistence
- **WHEN** a secretary submits a check, cash, waived, or already-received entry
- **THEN** the system MUST submit the selected payment method with the entry payload
- **AND** the system MUST not silently store the entry as an online card payment

### Requirement: Confirmation and next-step clarity
The system SHALL show confirmation copy and next steps that match the submitted payment and entry state.

#### Scenario: Paid online confirmation
- **WHEN** an exhibitor returns from successful online checkout
- **THEN** the system SHALL confirm that payment was recorded
- **AND** the system SHALL show known confirmation numbers, entry summaries, and armband information when available

#### Scenario: Pay-at-show confirmation
- **WHEN** an entry is submitted with check or cash due at the show
- **THEN** the system SHALL say the entry was submitted and payment is due at the show
- **AND** the system SHALL not imply the entry was paid online

#### Scenario: Waived or already-received confirmation
- **WHEN** a secretary submits a waived or already-received payment entry
- **THEN** the system SHALL confirm the entry submission and recorded payment state
- **AND** the system SHALL preserve any payment reference or notes captured during submission

#### Scenario: Missing armband assignment
- **WHEN** an entry is submitted but armband assignment is unavailable or fails
- **THEN** the system SHALL tell the secretary that the entry was submitted
- **AND** the system SHALL clearly direct them to assign the armband from the existing Entries Management surface

### Requirement: Show Desk late-entry return path
The system SHALL preserve Show Desk as the operational home for late/day-of entries.

#### Scenario: Late entry completes
- **WHEN** a secretary completes a late entry that started from Show Desk
- **THEN** the system SHALL return them to `/shows/:showId/show-desk`
- **AND** the system SHALL not send them to the public show details page

#### Scenario: Late entry is cancelled
- **WHEN** a secretary cancels or backs out of a late entry that started from Show Desk
- **THEN** the system SHALL return them to Show Desk or preserve a clear path back to Show Desk

### Requirement: Offline-aware show-day behavior
The system SHALL keep show-day entry operations aligned with existing offline-first and sync expectations.

#### Scenario: Show-day on-behalf entry with unreliable network
- **WHEN** a secretary records a pay-at-show or already-received entry during show-day operations
- **THEN** the system SHALL use established registration and entry submission paths that participate in existing sync behavior
- **AND** the system SHALL not require Stripe checkout for that entry

#### Scenario: Online checkout unavailable
- **WHEN** card checkout cannot be started because the user is offline or Stripe checkout is unavailable
- **THEN** the system SHALL present a calm retry or alternate-payment path appropriate to the active workflow
- **AND** the system SHALL not present the condition as a show-day blocking failure for secretary pay-at-show entry
