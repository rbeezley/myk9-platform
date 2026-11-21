# Checkout price snapshot: fulfil a paid session at the price it was sold at

> **Status:** Active

Linear: MYK9-2036 (money; design first). Deferred from MYK9-1931 (PR #3972) with the owner's override, 2026-11-15. Design only; no code has been written.

## Existing design

**Pricing at session creation.** `stripe-checkout` prices every cart line with `priceCartItems` (`apps/myk9show/supabase/functions/stripe-checkout/index.ts:764`), refuses a $0 line (`:771`), heals and refuses a cart whose stored `entry_fee_cents` drifted from that price (`:784-823`), and sends the computed cents to Stripe as `price_data.unit_amount` (`:836`) plus one service-fee line (`:860`). Session metadata carries only `cart_id`, `type` and the stamped platform-fee rates (`:921-925`). The per-line prices are therefore recorded in two places: Stripe's line items, and `entry_cart_items.entry_fee_cents`.

`stripe-payment-link` already works the other way: it prices each entry with `priceExistingEntryCents` (`stripe-payment-link/index.ts:350`) and writes a server-side `entry_payment_links` row with `amount_cents` (`:527-534`); at fulfilment the webhook reads per-entry fees back from Stripe's line items (`_shared/entryPaymentLineItems.ts:29`, used at `stripe-webhook/index.ts:2297`). It does not re-price.

**Re-pricing at fulfilment.** For a cart, `stripe-webhook` first runs `sessionMatchesCart` (`stripe-webhook/index.ts:1124`, `_shared/sessionCartGuard.ts`), then retrieves the session fresh from Stripe (`:1164`), re-reads show and class fees, and calls `priceCartItems` again with the webhook's own clock (`:1243-1285`). The platform fee uses the rate stamped on the session, not a live read (`:1288-1306`). If that total differs from Stripe's `amount_total`, it queues `paid_amount_mismatch` (`:1307-1325`) through `queueUnfulfilledCharge`, which queues a FULL refund request for a site admin to approve (`_shared/unfulfilledChargeRefund.ts:96-100`). No entries are made; the cart stays active.

**Why re-pricing exists.** The comment at `stripe-webhook/index.ts:1154-1163` (round-15 P1): every number `sessionMatchesCart` compares (cart totals, item fees) is owner-writable under migration 009's update policies (`supabase/migrations/009_online_entry_system.sql:464`). A payer could edit item fees and the subtotal in lockstep after opening checkout and get inflated paid entries that the payout cron then pays the club for. So the webhook checks against two sources the payer cannot write: Stripe's fresh session and a server-side recomputation. The platform fee was already moved to a snapshot (stamped rates) for exactly this issue's reason: an admin changing the rate mid-checkout must not reject a correct charge. Entry fees were never moved.

**When a correct charge is refused today.** Any change to the price inputs between Pay and the webhook (Stripe page and spot hold live about 31 minutes, `_shared/cartSpotHold.ts`): a deploy changing the fee rule, a secretary editing a show or class fee, and possibly the day-of tier switching at midnight in the show's zone (`nowIso` at `:1243`). Not traced: whether online entry can still be open across that midnight.

## Proposed shape

Verify fulfilment against the prices the server sent to Stripe, never the current rule.

Where the snapshot lives, weighed:

| Option                                                                                                                        | Tamper-proof             | Size                                                        | Cost                                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Session metadata (`cart_item_id -> cents`)                                                                                    | Yes (server-written)     | 50 keys, 500 chars a value: a large cart overflows          | No migration                                                     |
| Server-side row keyed by session id (`checkout_price_snapshots`, service role only, `REVOKE ALL` from anon and authenticated) | Yes, if grants are right | Unbounded                                                   | A migration and grants to verify                                 |
| **Stripe's own line items**, each carrying `cart_item_id` in `product_data.metadata`                                          | Yes (Stripe holds them)  | 100 per single read, same cap the payment-link path accepts | No migration; one Stripe call; reuses `entryPaymentLineItems.ts` |

Recommended if built: **Stripe's line items.** They are what the payer was actually charged, the payer cannot write them, and the payment-link path already fulfils this way. A server-side row is the fallback if the owner wants the snapshot readable without Stripe.

Fulfilment then checks, in order: `sessionMatchesCart` (unchanged); the fresh `amount_total` equals the sum of line items; every cart line has exactly one line item with a positive amount; the service-fee line equals `calculatePlatformFeeCents(subtotal, stamped rates)`. `lineAmounts` for `begin_cart_fulfillment` (`:1346-1351`) come from the line items. A refusal still happens, through the same unfulfilled-charge path, when: the line items cannot be read or a cart line has none (snapshot missing), the amounts do not add up to what Stripe captured, or the cart lines and line items do not match one to one. Nothing changes what a payer is charged, and refunds stay manual: a refusal only queues a request for a site admin (CLAUDE.md: refunds are never automatic).

## Do nothing?

- Today no price can differ from a fee-rule deploy: 0 classes have their own fee (`docs/plan-class-fees.md`, data read of 2026-11-13; confirmed again when #3972 shipped), and fee rules change rarely.
- A mismatch loses no money: the full charge is queued for an approved refund and an admin is alerted. The harm is an exhibitor who paid and has no entry until someone refunds and they enter again.
- The window is about 31 minutes per checkout. The likelier trigger is a secretary editing a fee during an open entry period, not a deploy.
- Launch relevance: low. It touches the most-reviewed money path (round-15 tamper defence) for a rare case with a safe failure.

**Recommendation: do nothing now.** Keep MYK9-2036 open at priority 4. Build the Stripe-line-item shape when either trigger appears: the first class gets its own fee, or a fee-rule change is about to ship. Before launch, one cheap check is worth doing on its own: confirm online entry closes before the show-day midnight, so the day-of tier cannot flip under an open checkout.

## Testing phase

All in `apps/myk9show/supabase/functions` vitest, driving the webhook's pure verification helper with injected Stripe line items:

1. **Rule A, then rule B.** Price a cart under rule A (show fee $25), build line items at $25, then change the inputs to rule B (class fee $30) before verification. Expect: fulfilled, `lineAmounts` = $25 a line, no `paid_amount_mismatch`.
2. **Tamper.** Same session, but the owner edits `entry_fee_cents` and `subtotal_cents` in lockstep to $40. Expect: refused (`sessionMatchesCart` or line items disagree with the cart), queued as unfulfilled, nothing fulfilled at $40.
3. **Missing snapshot.** Line items unreadable, or a cart line with no line item. Expect: refused through the unfulfilled-charge path.
4. **Captured amount differs** from the line-item sum or the service fee differs from the stamped rate. Expect: refused.
5. Existing suites stay green: `sessionCartGuard`, `unfulfilledChargeRefund`, `cartItemPricing`, `entryPaymentLineItems`.
