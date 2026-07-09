# refund-result-transparency Specification

## Purpose
Bulk-refund outcomes are actionable per entry: RefundAllEntriesCard renders every skipped entry with its reason and every failed payment intent with entry ids and error, never counts alone. Introduced by money-path-hardening-remainder (MP-11).
## Requirements
### Requirement: Bulk-refund results identify every skipped and failed entry
`RefundAllEntriesCard` SHALL render the per-entry detail already returned by the refund-all operation: skipped entries grouped by reason (showing each entry's identity), and failed payment intents with their entry ids and error message. Aggregate counts alone SHALL NOT be the only presentation of skipped or failed outcomes.

#### Scenario: Mixed outcome is actionable
- **WHEN** a refund-all run returns one refunded entry, one skipped entry (reason: not paid online), and one failed payment intent
- **THEN** the card shows the skipped entry with its reason and the failed payment intent with its entry ids and error, each identifiable enough for the secretary to act on

#### Scenario: Clean run stays compact
- **WHEN** a refund-all run returns zero skipped and zero failed entries
- **THEN** the card shows the success summary without empty detail sections
