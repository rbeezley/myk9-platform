# refund-result-transparency Specification

## Purpose

Bulk-refund outcomes are actionable per entry: RefundAllEntriesCard renders every skipped entry with its reason and every failed payment intent with entry ids and error, never counts alone. Introduced by money-path-hardening-remainder (MP-11).

## Requirements

### Requirement: Bulk-refund results identify every skipped and failed entry

`RefundAllEntriesCard` SHALL render the per-entry detail already returned by the refund-all operation: skipped entries grouped by a plain-language reason (showing each entry's identity), and each failed payment intent as a plain line with its entry ids. The plain line for a failed payment SHALL NOT claim the payment was not refunded, because a failed row can be a refund that went through whose entry stamp did not save; it SHALL tell the secretary that running Refund all again is safe. The raw skip reason code, payment intent id and error message SHALL remain available under a "Details for support" disclosure rather than in the main line. Aggregate counts alone SHALL NOT be the only presentation of skipped or failed outcomes.

#### Scenario: Mixed outcome is actionable

- **WHEN** a refund-all run returns one refunded entry, one skipped entry (reason: not paid online), and one failed payment intent
- **THEN** the card shows the skipped entry with its plain reason and the failed payment intent as a plain line with its entry ids, each identifiable enough for the secretary to act on
- **AND** no visible text says the failed payment was not refunded
- **AND** opening "Details for support" shows the skip reason code, the payment intent id and its error message

#### Scenario: Clean run stays compact

- **WHEN** a refund-all run returns zero skipped and zero failed entries
- **THEN** the card shows the success summary without empty detail sections
