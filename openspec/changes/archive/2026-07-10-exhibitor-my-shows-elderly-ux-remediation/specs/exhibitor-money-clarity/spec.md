# exhibitor-money-clarity Delta

## ADDED Requirements

### Requirement: Paid-in-full renders as quiet success

When the shared amount-due derivation computes $0.00 due, the My Shows fees tile SHALL render as a secondary, de-emphasized "Paid in full" success state linking to My Payments, without a prominent fee total. When a positive amount is due, the tile SHALL keep visual priority on the amount due and its existing pay path.

#### Scenario: Nothing due

- **WHEN** the shared derivation computes $0.00 due for the exhibitor's current entries
- **THEN** the fees tile shows a muted "Paid in full" state that links to My Payments and does not display a large dollar total

#### Scenario: Amount due keeps priority

- **WHEN** the shared derivation computes a positive amount due
- **THEN** the fees tile prominently shows the amount due and routes to the existing cart/checkout recovery path
