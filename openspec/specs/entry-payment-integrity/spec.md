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
