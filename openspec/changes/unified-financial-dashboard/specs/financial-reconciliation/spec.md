# financial-reconciliation

## ADDED Requirements

### Requirement: Historical online charges preserve immutable financial facts

The system SHALL persist the authoritative cent-based entry subtotal, platform fee,
fee rate, Stripe processing fee when available, and refunded cents for each online
order without rewriting original charge facts when current settings change.

#### Scenario: Fee-rate changes do not rewrite a historical order

- **WHEN** the platform fee setting changes after an order is paid
- **THEN** the order's stored fee rate and platform-fee cents remain the values used
  at charge time

#### Scenario: Stripe processing fee is not available yet

- **WHEN** the charge is recorded before its balance transaction fee can be retrieved
- **THEN** the order records the known charge facts and marks processing-fee/net-income
  reconciliation as pending rather than storing an estimated zero

### Requirement: Financial accounting includes every financially active entry

The system SHALL provide a cent-based accounting projection that includes entries
that were charged, paid, refunded, or waived regardless of later entry lifecycle
status, while preserving the existing printable Financial Report's filtering rules.

#### Scenario: Paid entry is withdrawn after payment

- **WHEN** an accepted entry is paid and later withdrawn
- **THEN** the accounting projection retains the paid amount and any refund evidence
  in the financial record

#### Scenario: Printable closeout remains lifecycle-scoped

- **WHEN** the existing show Financial Report renders current-entry totals
- **THEN** it continues to exclude lifecycle statuses defined by its existing contract
  and does not silently become the all-record accounting projection

### Requirement: Scope authorization is enforced server-side

The system SHALL authorize platform, club, and show scope in the server-side financial
projection and SHALL return no financial rows for a caller without permission for the
requested scope.

#### Scenario: Club admin requests another club

- **WHEN** a club admin requests a different club's financial scope
- **THEN** the projection returns no rows or totals for that club

#### Scenario: Secretary requests a managed show

- **WHEN** a secretary requests a show they are authorized to manage
- **THEN** the projection returns only that show's authorized financial data

#### Scenario: Unauthorized user requests a show

- **WHEN** a caller lacks permission to manage the requested show
- **THEN** the projection rejects or returns an empty result without exposing scope
  existence or customer PII

### Requirement: Large-scope totals are aggregated without truncation

The system SHALL calculate platform and club totals server-side and SHALL paginate
any row-level reconciliation list to completion rather than relying on a single
client response bounded by the PostgREST row limit.

#### Scenario: Club has more than one thousand financial rows

- **WHEN** a club requests its financial summary
- **THEN** totals include all authorized rows beyond the first one thousand

#### Scenario: Detail list has multiple pages

- **WHEN** a caller opens reconciliation details
- **THEN** the client can load every authorized page without changing the aggregate totals

#### Scenario: A charge has more than one hundred refunds

- **WHEN** Stripe returns multiple refund-list pages for one charge
- **THEN** the webhook evaluates every page before deriving the order refund ledger

### Requirement: Refund reconciliation follows terminal Stripe status

The system SHALL count a Stripe refund in financial totals only after it succeeds,
SHALL preserve failed or canceled refunds as terminal audit records that contribute no
money, and SHALL reconcile later status changes idempotently regardless of webhook
delivery order.

#### Scenario: Refund is pending or requires action

- **WHEN** a charge payload contains a refund whose status is `pending` or
  `requires_action`
- **THEN** the refund remains unbooked until a later `refund.updated` reports a
  terminal outcome

#### Scenario: Pending refund later succeeds

- **WHEN** `refund.updated` changes an in-flight refund to `succeeded`
- **THEN** the refund is booked once and duplicate delivery does not change totals

#### Scenario: Refund later fails or is canceled

- **WHEN** `refund.updated` or `refund.failed` reports `failed` or `canceled`
- **THEN** its retained audit row contributes nothing to derived refund totals and a
  later stale success delivery cannot resurrect it

#### Scenario: Fully refunded order is not locally succeeded

- **WHEN** refund facts cover a local order whose status is `pending` or `processing`
- **THEN** the order keeps its status, `refunded_at` stays null, and reconciliation
  still includes its gross, fee, and refund facts so the money nets correctly

#### Scenario: Failed audit row receives stale redelivery

- **WHEN** a terminally failed refund row receives a stale booking with a different
  amount
- **THEN** its recorded terminal amount, kind, and state remain unchanged

### Requirement: Charge verification and payout settlement remain separate

The system SHALL expose independent charge-verification and club-payout-settlement
states and SHALL identify a completed transfer by its matchable Stripe transfer id.

#### Scenario: Online entry matches its order snapshot

- **WHEN** an online entry's amounts tie to a valid Stripe order snapshot
- **THEN** its charge state is `Verified`

#### Scenario: Desk payment has no Stripe trace

- **WHEN** an entry is paid by check, cash, or waived
- **THEN** its charge state is `Attested`, it remains in accounting totals, and it is
  not reported as a Stripe mismatch

#### Scenario: Transfer is pending or genuinely failed

- **WHEN** a show payout is pending without a completed transfer or has a genuine failure
- **THEN** settlement remains distinct from charge verification and the unresolved
  condition is surfaced as an attention item

### Requirement: Platform income distinguishes gross from net

The system SHALL show platform gross fee income separately from net income, where net
income subtracts captured Stripe processing fees, refunded platform fees, and other
recorded reversals, and SHALL mark incomplete processing-fee data as pending.

#### Scenario: Complete fee snapshot is available

- **WHEN** an order has platform-fee and processing-fee snapshots with no reversal
- **THEN** platform gross fee income and platform net income are both shown with the
  net calculation grounded in stored cents

#### Scenario: Processing fee is missing

- **WHEN** an order's Stripe processing fee has not been captured
- **THEN** gross fee income remains available and net income identifies the pending
  component instead of treating the missing fee as zero

### Requirement: Reconciliation projection contains no customer PII

The server-side reconciliation contract SHALL return only financial, scope, status,
and identifier fields needed for accounting and SHALL exclude customer payment PII.

#### Scenario: Club treasurer views transfer evidence

- **WHEN** a club treasurer loads a show summary
- **THEN** the response includes the transfer id, amount, status, and date needed for
  Stripe matching but excludes customer names, emails, and payment-method secrets
