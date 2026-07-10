# exhibitor-money-clarity Specification

## Purpose
Payment status is derived from one shared amount-due computation across the entry chip, dashboard stats, and My Payments, so the three never disagree; a "Pay now" path exists wherever a balance is announced, and the payment chip is decoupled from the entry-review bucket.

## Requirements
### Requirement: Single amount-due derivation across exhibitor surfaces
The entry-card payment chip, the exhibitor dashboard fee stat, and the My Payments amount-due figure SHALL all derive from one shared amount-due computation. No exhibitor surface SHALL display a payment-owing indicator computed independently of that derivation.

#### Scenario: All surfaces agree when nothing is owed
- **WHEN** the shared derivation computes $0.00 due for an exhibitor's current entries
- **THEN** no entry card shows a "Payment Due" chip, the dashboard fee stat does not indicate money owed, and My Payments shows $0.00 due

#### Scenario: All surfaces agree when money is owed
- **WHEN** the shared derivation computes a positive amount due for an entry
- **THEN** that entry's card shows the payment-due indicator, and the dashboard fee stat and My Payments reflect the same outstanding amount

### Requirement: Payment chip is independent of entry review status
The entry card's payment indicator SHALL reflect payment state only. Entries whose review status remains in the pending/needs-review bucket (including the documented 'paid' and 'promotion-expired' cases) SHALL NOT display "Payment Due" solely because of their review-status bucket.

#### Scenario: Paid entry pending secretary review
- **WHEN** an entry is fully paid but its review status is in the pending/needs-review bucket
- **THEN** the card may show a pending-review status but SHALL NOT show a payment-due indicator

### Requirement: Pay path wherever a debt is announced
Any exhibitor surface that displays a positive amount due SHALL offer an action that routes to the existing cart/checkout flow for that debt.

#### Scenario: Entry card with amount due
- **WHEN** an entry card displays a payment-due indicator
- **THEN** the card offers a "Pay now" (or equivalent) action that deep-links into the existing payment flow for that entry

### Requirement: Paid-in-full renders as quiet success
When the shared amount-due derivation computes $0.00 due, the My Shows fees tile SHALL render as a secondary, de-emphasized "Paid in full" success state linking to My Payments, without a prominent fee total. When a positive amount is due, the tile SHALL keep visual priority on the amount due and its existing pay path.

#### Scenario: Nothing due
- **WHEN** the shared derivation computes $0.00 due for the exhibitor's current entries
- **THEN** the fees tile shows a muted "Paid in full" state that links to My Payments and does not display a large dollar total

#### Scenario: Amount due keeps priority
- **WHEN** the shared derivation computes a positive amount due
- **THEN** the fees tile prominently shows the amount due and routes to the existing cart/checkout recovery path
