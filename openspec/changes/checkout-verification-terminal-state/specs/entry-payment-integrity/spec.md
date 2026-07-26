## ADDED Requirements

### Requirement: Checkout verification recovery is idempotent

The system SHALL keep delayed checkout verification and recovery bound to the original Stripe
Checkout Session and SHALL prevent the same active cart from producing a second payable session
while the original session remains open or has completed payment.

#### Scenario: Exhibitor checks a still-processing payment again

- **WHEN** the checkout return page has not yet found a completed order and the exhibitor checks status again
- **THEN** the system SHALL verify the same Checkout Session identifier from the return URL
- **AND** it SHALL not invoke the checkout-session creation path

#### Scenario: Unchanged cart already has an open Checkout Session

- **WHEN** checkout creation is requested again for an unchanged active cart with an open Stripe Checkout Session
- **THEN** the server SHALL return the existing payable session instead of creating another one

#### Scenario: Cart Checkout Session is complete and webhook processing is pending

- **WHEN** checkout creation is requested for an active cart whose linked Stripe Checkout Session is already complete
- **THEN** the server MUST reject replacement-session creation
- **AND** it SHALL tell the caller that the original payment is processing

#### Scenario: Prior Checkout Session cannot be inspected or expired

- **WHEN** checkout creation finds a linked prior Stripe Checkout Session
- **AND** Stripe cannot safely inspect it or expire a stale open session
- **THEN** the server MUST refuse to create a replacement payable session
- **AND** it SHALL return a retryable error without changing the cart's session identity
