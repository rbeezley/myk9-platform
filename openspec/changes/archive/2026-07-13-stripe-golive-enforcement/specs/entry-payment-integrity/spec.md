## ADDED Requirements

### Requirement: Waitlist offer owners can request only their own promoted payment

The payment-link function SHALL extend authenticated authorization to an exhibitor only when every
requested entry belongs to that caller's active offered waitlist promotion; existing organizer and
internal authorization paths SHALL remain unchanged.

#### Scenario: Offer owner requests their promoted entry

- **WHEN** an authenticated exhibitor requests a payment link for the `pending-payment` entry linked
  from their own unexpired `offered` waitlist row
- **THEN** the function SHALL allow the request after all existing fee, show, club-account, status,
  redirect, and duplicate-link checks pass

#### Scenario: Offer owner requests an unrelated unpaid entry

- **WHEN** the same exhibitor requests a payment link for an unpaid entry not linked from their own
  active offered waitlist row
- **THEN** the function MUST reject the request

#### Scenario: Existing organizer requests payment

- **WHEN** an authorized secretary, owning-club admin, or site admin requests payment for eligible
  entries
- **THEN** the existing organizer authorization and behavior SHALL remain available

### Requirement: Waitlist payment reconciliation remains idempotent

The existing payment-link webhook path SHALL reconcile a promoted waitlist payment exactly once,
close the offered row, and remain safe under payment-versus-expiry or payment-versus-decline races.

#### Scenario: Promoted entry payment completes

- **WHEN** Stripe reports a freshly retrieved paid Checkout Session for an active promoted entry
- **THEN** the webhook SHALL mark the entry paid using the existing tracked-link authority
- **AND** it SHALL close the linked waitlist offer without duplicating entry or payment records

#### Scenario: Expiry wins before payment completion

- **WHEN** the offer becomes inactive before a late paid event is reconciled
- **THEN** the existing invalid-charge/refund safety path SHALL prevent an inactive entry from
  silently remaining paid and capacity-consuming
