# testing-money-path Specification

## Purpose

TBD - created by archiving change test-coverage-money-path. Update Purpose after archive.

## Requirements

### Requirement: Money-path logic has behavioral unit tests

App-side money logic (refund eligibility, payment-request eligibility, enrollment payment amounts, usePaymentProcessing) SHALL have colocated table-driven Vitest suites asserting intended behavior, including error and edge cases.

#### Scenario: Refund eligibility decision table

- **WHEN** an entry's paymentMethod, paymentStatus, and refundedAt vary across the decision table
- **THEN** `isStripeRefundable` returns true only for online, PAID_ONLINE, not-yet-refunded entries
