# exhibitor-payment-history Specification

## Purpose
Defines complete, request-bounded retrieval for the existing exhibitor payment ledger so long-lived accounts remain accurate and usable without oversized database requests.

## Requirements

### Requirement: Payment history requests remain bounded without hiding rows
The system SHALL retrieve an exhibitor's payment history through explicitly bounded server requests while preserving the complete all-time ledger.

#### Scenario: Exhibitor opens the all-time ledger
- **WHEN** the exhibitor opens My Payments without a selected year
- **THEN** every Stripe-order request SHALL use an explicit bounded range
- **AND** the system SHALL continue through all available pages without silently truncating history

#### Scenario: Multiple orders share a timestamp at a page boundary
- **WHEN** paged orders have identical creation timestamps
- **THEN** the system SHALL use a stable secondary order so no order is duplicated or skipped

### Requirement: Payment follow-up reads remain bounded
The system SHALL prevent related entry and refund lookups from growing into an unbounded request or `IN` list.

#### Scenario: Ledger contains many related entries
- **WHEN** payment orders reference more entries than one bounded lookup accepts
- **THEN** the system SHALL retrieve entry details in bounded chunks
- **AND** SHALL combine those chunks without losing refund details

#### Scenario: Selected year contains entry-level refunds
- **WHEN** an entry is refunded during the selected year but its owning order was created earlier
- **THEN** the owning order SHALL be included so the refund remains visible in that year's ledger

### Requirement: Server year scope matches displayed calendar year
The system SHALL use the same browser-local calendar-year boundary for server retrieval, displayed rows, and payment totals.

#### Scenario: Payment falls near New Year
- **WHEN** a payment instant falls on different dates in UTC and the browser's local timezone
- **THEN** the selected-year server range SHALL classify it in the same year as the rendered ledger and totals

#### Scenario: Invalid or absent year is opened
- **WHEN** the URL has no valid four-digit year selection
- **THEN** My Payments SHALL default to the complete all-time ledger
- **AND** SHALL NOT silently hide rows

### Requirement: Existing payment workflow remains canonical
The system SHALL keep the existing My Payments page and its established receipt and payment handoffs as the only exhibitor payment-history workflow.

#### Scenario: Bounded history is introduced
- **WHEN** the retrieval strategy changes
- **THEN** the existing year selector, totals, receipt links, and payment handoffs SHALL remain available
- **AND** the system SHALL NOT introduce a second ledger or checkout workflow
