## ADDED Requirements

### Requirement: Active waitlist offers are actionable on My Shows/My Entries

The system SHALL show an exhibitor's active offer, deadline, Complete payment action, Decline
action, and recovery state in the existing My Shows/My Entries waitlist section without adding a
separate payment page.

#### Scenario: Exhibitor opens a deep-linked active offer

- **WHEN** an authenticated exhibitor follows an offer link containing their waitlist id
- **THEN** My Shows/My Entries SHALL focus the matching offered row
- **AND** the row SHALL show the dog, class, show, deadline, Complete payment, and Decline actions

#### Scenario: Offer link belongs to another exhibitor

- **WHEN** an exhibitor follows a waitlist-offer id they do not own
- **THEN** the page SHALL NOT expose the other exhibitor's offer details or actions

#### Scenario: Offer is expired

- **WHEN** the offer deadline has passed or the entry is no longer eligible
- **THEN** the row SHALL not start checkout
- **AND** it SHALL explain the expired or reconciled state in plain language

### Requirement: Exhibitor checkout is owner-authorized and Stripe-hosted

The system SHALL allow an authenticated exhibitor to request a payment link only for their own
active promoted waitlist entry and SHALL continue to collect card details only on Stripe Checkout.

#### Scenario: Owner starts payment

- **WHEN** the offer owner chooses Complete payment before the deadline
- **THEN** the system SHALL authorize ownership and active offer state server-side
- **AND** it SHALL redirect to a newly valid Stripe-hosted Checkout Session

#### Scenario: Owner retries after a Stripe link expires

- **WHEN** the waitlist offer is still active but its prior Stripe session expired unpaid
- **THEN** the system SHALL safely close the stale tracked link
- **AND** it SHALL issue a fresh tracked session without duplicating payment

#### Scenario: Authenticated user requests an ordinary unpaid entry

- **WHEN** an exhibitor calls the waitlist-owner payment path for an entry not linked to their
  active offered waitlist row
- **THEN** the system MUST reject the request

#### Scenario: Mixed-owner request

- **WHEN** one payment-link request includes entries owned by different exhibitors or different shows
- **THEN** the system MUST reject the complete request

### Requirement: Exhibitor can decline an unpaid offer safely

The system SHALL provide one owner-authorized decline operation that coordinates the offered
waitlist row, promoted entry, and any tracked Stripe session.

#### Scenario: Owner declines before payment

- **WHEN** the offer owner declines an active unpaid offer
- **THEN** the system SHALL expire the offer and promoted entry
- **AND** it SHALL expire any open Stripe Checkout Session
- **AND** the next waiting row SHALL remain eligible for the existing cascade

#### Scenario: Decline races completed payment

- **WHEN** Stripe reports that the session is already paid while decline is processing
- **THEN** decline SHALL fail closed without overwriting paid state
- **AND** webhook reconciliation SHALL remain authoritative

#### Scenario: Non-owner attempts decline

- **WHEN** an authenticated user attempts to decline another exhibitor's offer
- **THEN** the system MUST reject the operation without changing waitlist, entry, or Stripe state

### Requirement: Offer actions remain accessible and calm

The existing offered row SHALL use plain entry language, keyboard/touch-accessible controls, and
minimum 44px action targets at supported mobile and desktop widths.

#### Scenario: Payment request fails transiently

- **WHEN** Stripe or the network cannot create a payment session
- **THEN** the row SHALL keep the offer visible
- **AND** it SHALL show a calm retry action without implying that the spot was lost
