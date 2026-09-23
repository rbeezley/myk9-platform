# MYK9-639 SQL settlement authority

## Goal

Move payment settlement authority into one service-only Postgres transaction. Stripe edge functions provide a fresh verified Checkout Session, PaymentIntent, gross amount, and a complete per-source-line price evidence array. SQL locates the persisted cart or payment link, derives source lines, move-up money roots, and live service rows from locked database state, and commits one canonical order with entry stamps and an exact expected make-whole amount.

## Data flow

1. Persist link line prices at issuance; cart lines already persist their fee in cents.
2. `settle_entry_order` locks the source locator and every persisted source line, verifies the caller's line evidence is an exact one-to-one match, and rejects a second PaymentIntent for a consumed source.
3. For existing lines, derive the money root and unique current live descendant from the stored move-up graph. For cart lines, revalidate dog/class/show/fee against the DB and call `create_online_paid_entry` inside this transaction.
4. Apply the existing waitlist/capacity decisions, stamp accepted money roots, and atomically persist canonical service IDs, fee/gross snapshots, source status, and expected make-whole snapshot. Stripe refund calls remain outside SQL.
5. Same-session retries return the stored result after checking the same source and payment facts.

Caller-provided root/live IDs are not authority. The plan contains no parallel TypeScript lineage algorithm. Existing move/reverse and refund semantics remain unchanged.

## Compatibility and rollout

New payment-link rows must persist the fee snapshot, and new Stripe Sessions must carry the exact source-line locator before this settlement RPC handles them. Existing open links have no durable per-line fee snapshot, and existing Stripe Sessions lack the new cart line identifiers. Do not infer or backfill either from current prices or move-up state. Those legacy paid sessions fail closed and require the established full-refund/manual recovery. This migration does not expire or cancel existing live sessions; deployment must coordinate the edge-function cutover and operator recovery path.

## Verification

Add transactional psql behavioral assertions for forged identity, missing/extra/duplicate source lines, price drift, same-show wrong dog/class, multi-hop lineage and reversal, waitlist/denial, mixed cart outcomes, transaction rollback, retry/second PaymentIntent, and gross/fee/refund reconciliation. Assert the exact `overflow_refund` metadata keys consumed by `getFullOverflowRefund`, including the no-accepted-entry `full_make_whole` reason. Add a two-session CI lock-order regression: one mixed-cart settlement resolves an existing line and creates a new line while an independent `create_online_paid_entry` targets the same confirmed judge-day/class; both calls must complete without `40P01` under either start order. The settlement must acquire all new-line judge-day advisory keys in deterministic `(person_id, trial_date)` order before lineage/class locks, matching the existing capacity RPC key. Run migration lint / SQL formatting checks available locally; execute behavioral and concurrent SQL suites if a local database runtime is available. Do not apply this migration to a shared database.

## Scope boundary

Only the SQL contract, payment-link issuance snapshot schema, structural plan/spec, and behavioral SQL tests are in this task. Checkout/webhook/payment-link TypeScript integration is handled separately. Do not push, open a PR, apply a migration, deploy, or execute any payment/refund.
