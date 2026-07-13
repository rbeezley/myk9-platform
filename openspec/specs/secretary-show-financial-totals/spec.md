# secretary-show-financial-totals

## Purpose

TBD - captures show-scoped financial totals reporting for secretaries (club closeout, payment-method reconciliation, waitlist fee exposure) and the entry-status/payment-status separation that report data relies on.

## Requirements

### Requirement: Printable Show Financial Totals

myK9Show SHALL provide a show-scoped Financial Report on the existing Reports page that prints club closeout totals.

#### Scenario: Secretary prints current-entry financial totals

- **GIVEN** a secretary opens the Reports page for a show
- **WHEN** they select Financial Report with the current-entry filter
- **THEN** the report SHALL include gross fees, discounts, waived/comped amount, collected amount, refunded amount, outstanding amount, and net retained amount
- **AND** the report SHALL exclude waitlisted, withdrawn, scratched, rejected, not accepted, and missing-info entries from the current-entry totals.

#### Scenario: Club reconciles payment methods

- **GIVEN** a show has online, check, cash, pending, waived, and refunded entries
- **WHEN** the Financial Report renders
- **THEN** it SHALL show a payment-method breakdown suitable for reconciling online payments, checks, cash, pending balances, waived entries, and refunds.

#### Scenario: Secretary reviews waitlisted financial exposure

- **GIVEN** a show has waitlisted entries
- **WHEN** the secretary selects the waitlist filter for Financial Report
- **THEN** the report SHALL show the waitlisted entries and their fee exposure separately from accepted/current entry totals.

### Requirement: Separate Entry Status From Payment Status

Report data SHALL preserve entry lifecycle status separately from payment status.

#### Scenario: Accepted unpaid entry appears as current and outstanding

- **GIVEN** an accepted entry has `entry_status = accepted` and `payment_status = pending`
- **WHEN** the Financial Report computes totals
- **THEN** the entry SHALL be included in current-entry counts
- **AND** its net fee SHALL appear as outstanding, not collected.

#### Scenario: Paid entry remains financial evidence

- **GIVEN** an entry has `entry_status = accepted` and `payment_status = paid_by_check`
- **WHEN** report data is mapped
- **THEN** the report entry SHALL retain `entryStatus = accepted`
- **AND** `paymentStatus = paid_by_check`.
