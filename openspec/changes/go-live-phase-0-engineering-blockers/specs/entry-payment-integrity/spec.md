## ADDED Requirements

### Requirement: Payment-link duplicate delivery is idempotent

The system SHALL treat repeated `checkout.session.completed` deliveries for the same entry payment
request and Stripe payment intent as idempotent success.

#### Scenario: Duplicate delivery for same paid link

- **WHEN** `stripe-webhook` receives two `checkout.session.completed` events for the same entry
  payment request link and the same Stripe payment intent
- **THEN** the first event marks the link and entries paid
- **AND** the second event does not create a Stripe refund
- **AND** the entries remain paid

#### Scenario: Link already closed by another handler

- **WHEN** a webhook handler attempts to close an entry payment request link whose status is no
  longer eligible for the current reconciliation path
- **THEN** the handler exits without refunding the current session unless the entry state proves the
  current charge is invalid

#### Scenario: Link close write fails

- **WHEN** the webhook cannot persist the paid/closed status for an entry payment request link
- **THEN** the handler surfaces the persistence failure instead of silently discarding it

### Requirement: Stripe persisted identifiers are mode-scoped

The system SHALL scope persisted Stripe customers and connected accounts by whether the running
Stripe key is test mode or live mode.

#### Scenario: Live checkout ignores test customer row

- **WHEN** checkout runs with an `sk_live` key for a person who has only a test-mode
  `stripe_customers` row
- **THEN** checkout creates or uses a live-mode customer row instead of reusing the test-mode row

#### Scenario: Customer portal lookup is mode-scoped

- **WHEN** the customer portal runs with a live-mode key
- **THEN** it looks up only live-mode persisted customers

#### Scenario: Connected account lookup is mode-scoped

- **WHEN** connect onboarding or payout processing runs with a live-mode key
- **THEN** it uses only live-mode club Stripe account rows

#### Scenario: Webhook stamps connected account mode

- **WHEN** the account webhook persists or updates a connected account row
- **THEN** the row records the Stripe account livemode value

#### Scenario: Payout cron detects mode mismatch

- **WHEN** payout processing sees a club Stripe account row whose mode does not match the running
  Stripe key
- **THEN** the system skips that row and alerts an operator instead of attempting a mismatched
  Stripe operation
