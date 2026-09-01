## MODIFIED Requirements

### Requirement: Exhibitor amount due display remains consistent

The system SHALL show unpaid exhibitor balances consistently across My Shows and My Payments using the existing entry, cart, and payment records. A completed online checkout SHALL also converge to a truthful confirmation state without requiring the exhibitor to resubmit payment or manually recover a readable order.

#### Scenario: Money due appears in My Payments

- **WHEN** My Shows indicates an exhibitor owes money for entries
- **THEN** My Payments SHALL show the same amount due for those entries
- **AND** My Payments SHALL provide a path to start or continue payment when payment is available

#### Scenario: Payment history separates totals

- **WHEN** My Payments shows completed payment history
- **THEN** the display SHALL distinguish gross paid, refunds, and net paid in plain language

#### Scenario: No duplicate payment workflow

- **WHEN** an exhibitor needs to pay an unpaid balance
- **THEN** My Payments SHALL link into the existing cart or checkout handoff
- **AND** My Payments SHALL NOT introduce a separate payment collection workflow

#### Scenario: Successful checkout confirmation recovers

- **WHEN** Stripe has succeeded but the checkout order is temporarily unreadable during the initial confirmation poll
- **THEN** the existing checkout confirmation surface SHALL automatically re-check and show success once the order is readable
- **AND** it SHALL not ask the exhibitor to submit a second payment
