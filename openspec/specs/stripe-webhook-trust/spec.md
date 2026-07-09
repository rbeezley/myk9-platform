# stripe-webhook-trust Specification

## Purpose
Trust boundaries for the Stripe webhook's entry payment paths: both cart and payment-link handlers gate on a freshly retrieved session (never the untrusted payload) and only process payment_status='paid'; per-entry refund stamping is idempotent and fails closed when a zero-row stamp cannot be proven benign. Introduced by money-path-hardening-remainder (MP-05/MP-07/MP-09).
## Requirements
### Requirement: Entry payment completion requires a freshly retrieved paid session
`handleEntryPaymentCompleted` in `stripe-webhook` SHALL retrieve the checkout session from Stripe and SHALL return without processing when the freshly retrieved session's `payment_status` is not `'paid'`. Delayed-notification payment methods are handled by the later `checkout.session.async_payment_succeeded` event re-driving the handler.

#### Scenario: Unpaid delayed-notification session is deferred
- **WHEN** a `checkout.session.completed` event arrives and the freshly retrieved session has `payment_status = 'unpaid'`
- **THEN** the handler returns without marking entries paid or creating `stripe_orders` rows

#### Scenario: Async payment success completes the entry
- **WHEN** a `checkout.session.async_payment_succeeded` event arrives for that session with `payment_status = 'paid'`
- **THEN** the handler processes the payment exactly as a paid `checkout.session.completed` would

### Requirement: Payment-link completion uses freshly retrieved session values
`handleEntryPaymentRequestCompleted` SHALL retrieve the checkout session from Stripe at the top of the handler and SHALL use the fresh session's `amount_total` and `payment_status` for all downstream writes, never the webhook payload's values. Processing SHALL be skipped when the fresh `payment_status` is not `'paid'`.

#### Scenario: Payload amount is ignored in favor of fresh amount
- **WHEN** a payment-link completion event's payload carries `amount_total = 0` but the freshly retrieved session reports the true positive amount
- **THEN** the `stripe_orders` row and entry payment records are written with the fresh amount, not `$0`

#### Scenario: Unpaid link session is not processed
- **WHEN** the freshly retrieved link session has `payment_status` other than `'paid'`
- **THEN** no entry is marked paid and no order row is created

### Requirement: Per-entry refund stamping is idempotent
The per-entry refund stamp update SHALL be guarded so it only transitions entries whose `payment_status` is currently `'paid'` (filtering with `.eq('payment_status','paid')` and selecting affected ids). When zero rows match, the handler SHALL log and continue without overwriting an existing refund stamp.

#### Scenario: Concurrent show-level and per-entry refund stamps do not conflict
- **WHEN** a per-entry refund stamp runs after the show-level refund has already stamped the same entry
- **THEN** the per-entry update affects zero rows, the handler logs the no-op, and the existing stamp is preserved
