## MODIFIED Requirements

### Requirement: Confirmation and next-step clarity

The system SHALL show confirmation copy and next steps that match the submitted payment and entry state.

#### Scenario: Paid online confirmation

- **WHEN** an exhibitor returns from successful online checkout
- **THEN** the system SHALL confirm that payment was recorded
- **AND** the system SHALL show known confirmation numbers, entry summaries, and armband information when available

#### Scenario: Paid checkout is still processing

- **WHEN** an exhibitor returns from Stripe but the paid order is not yet available after bounded verification
- **THEN** the existing checkout return page SHALL show an explicit still-processing state
- **AND** it SHALL tell the exhibitor not to submit another payment
- **AND** it SHALL offer a same-session status check and a link to the existing My Entries surface

#### Scenario: Checkout has a known failed terminal status

- **WHEN** verification finds that the original Checkout Session's order has failed or was cancelled
- **THEN** the existing checkout return page SHALL show a plain-language failed state
- **AND** it SHALL not claim that payment probably succeeded

#### Scenario: Payment verification is unavailable or times out

- **WHEN** authentication, a query failure, or a bounded request timeout prevents the app from determining the payment outcome
- **THEN** the existing checkout return page SHALL explain that the result cannot currently be confirmed
- **AND** it SHALL tell the exhibitor not to submit another payment until the original session is checked

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
