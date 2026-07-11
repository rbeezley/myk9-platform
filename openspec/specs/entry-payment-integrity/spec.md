# entry-payment-integrity

## Purpose

Defines the entry payment-method and payment-status integrity rules that keep payout inputs aligned
with how entry fees were actually collected. Introduced by `money-path-hardening-phase1` for the
fall 2026 launch-readiness money-path gate.

## Requirements

### Requirement: Entry submission persists payment method

The system SHALL persist the payment method supplied to `submit_show_entries` on every inserted
entry row.

#### Scenario: Check entry submitted through RPC

- **WHEN** `submit_show_entries` is called with `p_payment_method` set to `check`
- **THEN** each created entry row has `payment_method = 'check'`

#### Scenario: Waived entry authorization remains intact

- **WHEN** a non-official caller submits entries with `p_payment_method` set to `waived`
- **THEN** the RPC rejects the submission using the existing authorization failure path

### Requirement: Online payment status transition guard

The system SHALL prevent non-`service_role` writers from moving online entries into payout-eligible
payment statuses without a Stripe-backed service write.

#### Scenario: Manager attempts to mark online entry paid

- **WHEN** a non-`service_role` writer updates an entry whose effective payment method is `online`
  so `payment_status` becomes `paid`
- **THEN** the update is rejected

#### Scenario: Manager attempts to mark online entry refunded

- **WHEN** a non-`service_role` writer updates an entry whose effective payment method is `online`
  so `payment_status` becomes `refunded`
- **THEN** the update is rejected

#### Scenario: Manager attempts to relabel online entry while marking it paid

- **WHEN** a non-`service_role` writer updates an entry from `payment_method = 'online'` to a
  desk method while also setting `payment_status = 'paid'`
- **THEN** the update is rejected

#### Scenario: Service role marks online entry paid

- **WHEN** the `service_role` path updates an online entry so `payment_status` becomes `paid`
- **THEN** the update is allowed

#### Scenario: Staff marks desk entry paid

- **WHEN** an authorized non-`service_role` staff path updates a `check`, `cash`, `waived`, or
  `secretary_paid` entry so `payment_status` becomes `paid`
- **THEN** the update is allowed

### Requirement: Existing row audit remains explicit

The system SHALL provide an explicit pre-go-live audit step for existing entries that are marked
as online payments without a Stripe payment intent.

#### Scenario: Operator audits existing online rows without intent

- **WHEN** the phase is shipped before live payouts
- **THEN** the runbook or tracking notes identify the query for counting `payment_method = 'online'`
  rows with no `stripe_payment_intent_id` and paid/refunded status

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

### Requirement: Exhibitor amount due display remains consistent

The system SHALL show unpaid exhibitor balances consistently across My Shows and My Payments using
the existing entry, cart, and payment records.

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
