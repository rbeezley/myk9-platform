## ADDED Requirements

### Requirement: Entry Management surfaces outstanding balances

The Entry Management page SHALL display the show's total outstanding balance (amounts owed on entries that are not fully paid, net of waived/comped and refunds) using the same computation as the Financial Report, so a secretary can reconcile accepted entries without leaving the page.

#### Scenario: Outstanding stat reflects unpaid entries

- **WHEN** the show has accepted entries with pending or partial payments
- **THEN** Entry Management shows an Outstanding stat whose dollar total matches the Financial Report's outstanding total for the same data

#### Scenario: Fully settled show reads zero

- **WHEN** every entry is paid, waived, or refunded in full
- **THEN** the Outstanding stat reads zero
