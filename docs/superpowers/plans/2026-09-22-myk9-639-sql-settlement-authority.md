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

Add transactional psql behavioral assertions for forged identity, missing/extra/duplicate source lines, price drift, same-show wrong dog/class, multi-hop lineage and reversal, waitlist/denial, mixed cart outcomes, transaction rollback, retry/second PaymentIntent, and gross/fee/refund reconciliation. Assert the exact `overflow_refund` metadata keys consumed by `getFullOverflowRefund`, including the no-accepted-entry `full_make_whole` reason. The latest `evaluate_entry_capacity` definition is `20260712210000_entry_capacity_exhibitor_aware_waitlist_reuse.sql`; it takes show-capacity, class, then judge-day locks, and the latest `create_online_paid_entry` definition in `20260712200100_entry_capacity_write_boundaries.sql` delegates to it. No later overrides were found. `settle_entry_order` takes the same per-show capacity lock before lineage or capacity writes, leaving the remaining order to the canonical RPC. Add a two-session CI regression: race a mixed-cart settlement against an independent `create_online_paid_entry` for the same show/class in both start orders; both calls must complete without `40P01`. Run migration lint / SQL formatting checks available locally; execute behavioral and concurrent SQL suites if a local database runtime is available. Do not apply this migration to a shared database.

## Scope boundary

Only the SQL contract, payment-link issuance snapshot schema, structural plan/spec, and behavioral SQL tests are in this task. Checkout/webhook/payment-link TypeScript integration is handled separately. Do not push, open a PR, apply a migration, deploy, or execute any payment/refund.

## Concurrency proof redesign (2026-09-23)

The first two-session runner paused on a lock acquired by the test before either RPC ran. An adversarial review showed that waiting on that artificial lock could pass even if the settlement RPC lost its show-capacity lock. Delete that barrier rather than adding another guard around it.

For each start order, run the first **real** RPC inside a transaction and hold the transaction open after the RPC returns. Verify through `pg_locks` that this backend owns the canonical `showcapacity:<show-id>` advisory lock. Only then start the other RPC in a second connection. Require that its blocked advisory lock has the same key and `pg_blocking_pids` names the first backend. Release the first transaction, wait for both to complete, then verify one canonical order/root and idempotent settlement retry. Use separate clean fixture identities for the two orders. The fixture must retain its role/transaction context and be created only on an exact loopback, freshly reset Supabase database; CI owns start/reset/stop. Explicitly fail if fixture IDs already exist rather than silently reuse them. A source-order SQL assertion remains a complementary guard, not a substitute for this observed lock graph.

Testing phase: run the harness contract and Bash syntax checks locally; run the full behavioral and two-session SQL steps in CI on a migrated disposable Supabase database. A draft PR that skips those jobs is not closure proof. Review the resulting logs for both observed lock waits and the persisted money/entry assertions before advancing the payment PR.
