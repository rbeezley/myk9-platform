# Nightly retry for a missing Stripe processing fee

> **Status:** Active

Tracking: MYK9-2541. Owner decision 3 (2026-11-27): "Nightly retry". Money code, design first.

## What exists and why

- **Where the fee is written.** The webhook reads the fee once, at checkout, in `fetchProcessingFeeCents` (`apps/myk9show/supabase/functions/stripe-webhook/index.ts:217`). It retrieves the payment intent with `expand: ['latest_charge.balance_transaction']` and passes the charge to `extractProcessingFeeCents` (`_shared/orderSnapshot.ts:302`), which returns `balance_transaction.fee` or `null`. The value lands in `stripe_orders.stripe_processing_fee_cents` through `buildOrderSnapshotFields` (`orderSnapshot.ts:161`), on the order **insert** only: the cart path (`index.ts:1785`) and the payment-link path (`index.ts:2367`). No code ever updates the column afterwards.
- **Why it can be missing.** At event time Stripe may not have created the balance transaction yet, or the retrieve call fails. Either way the function returns `null`, which means "pending", never zero (`20260717122000_stripe_order_snapshots.sql:24-27`). A partial index for exactly these rows already exists: `idx_stripe_orders_processing_fee_pending` (`:151-153`).
- **The alert.** On `null`, both paths call `warnMissingProcessingFee` (`index.ts:244`, called at `:1855` and `:2419`). It raises "Stripe processing fee not captured — MANUAL BACKFILL REQUIRED" with source `stripe-webhook` and dedupe key `processing-fee-pending-<pi>`. Its comment (`:237-243`) says "NOT self-healing" and asks that any future backfill update the comment and the alert together. `git log -S` traces the comment and the column to the MYK9-54 financial reconciliation work of 2026-07-18 (`d12a284143`, `b86ba1d728`); on `main` both first appear in `04be609371` (2026-09-03), where that history was squashed. The same "nothing retries" note is repeated in `PlatformIncomeCard.tsx:49-53` and `platformAttention.ts:53-55`.
- **The Payouts line.** `financial_reconciliation_summary` (`20261119041300_myk9_2170_payout_brake.sql:476`) counts entry orders with `stripe_processing_fee_cents IS NULL` (`:583`) and sums their platform fee (`:584-587`). Its order scope is `status IN ('succeeded','refunded')` or any refund (`:529-533`). `financialSummary.ts:210` maps the count to `pendingOrderCount`, and `PlatformIncomeCard.tsx:54-60` prints "Excludes N orders … still to net out". Filling the column drops an order from that count with no UI change.
- **Alerts.** `alertAdmin` (`_shared/alertAdmin.ts:86`) inserts into `operator_alerts`, then emails. The table (`20260709130000_create_operator_alerts.sql:50-60`) has `resolved_at`, `resolved_by` and a `detail` jsonb, but no note column. A partial unique index on `(source, dedupe_key)` for unresolved rows dedupes (`:73-75`). A job can resolve its own alert with an `UPDATE … SET resolved_at = now()`, as the payout reminders do (`20261126034519_myk9_2182_payout_approval_reminders.sql:78-83`). `/admin/health` lists unresolved alerts only.
- **Crons.** pg_cron calls an edge function with `net.http_post`, reading the base URL, service key and a per-job secret from Vault (`20260619130000_payout_cron_vault_secret.sql:28-30`, `nightly-show-payouts` at 02:00 UTC). `cron-health-check` reports every scheduled job other than payouts in one `background_jobs` check (`_shared/systemHealthChecks.ts:428`). That check proves only that the request was dispatched (`:234-242`). `cron-waitlist-expiration/cronOutcome.ts:9` adds a Sentry cron check-in for the real outcome.

## Own cron, or a step in MYK9-1957?

`docs/plan-stripe-nightly-reconciliation.md` designs `cron-stripe-reconcile` at 03:30 UTC. It is not built: no function and no migration exist on this branch.

- **For a step inside it:** one schedule, one Vault secret, one Stripe client.
- **Against:** that plan promises the job "never writes to `stripe_orders`". That promise is what makes a report-only checker safe to run against money tables, and this job must write there. Also, MYK9-1957 still needs a cutover column, a store for its result, a health check and an `independent` review. Waiting on it keeps the four alerts open for no reason.

**Recommendation: its own small cron, `cron-stripe-fee-backfill`, at 03:00 UTC.** It runs after payouts and before reconciliation. MYK9-1957 then compares a fee that is already filled in. The cost is one more Vault secret and one migration.

## Owner decision

Owner, 2026-11-28 (in chat): "2541 go with option 2", the minimal cron, after review round 2 showed the fuller design growing past the problem (four test orders, $9.80). Dropped from the earlier draft: the attempts table, the alert takeover, and the N-nights threshold. The webhook keeps raising one alert per order, as it does today, with new wording.

## The shape

Two parts: one edge function, `cron-stripe-fee-backfill`, and one migration. The migration carries the trigger change, one service-role RPC and the schedule.

1. **A typed lookup, shared.** `_shared/processingFee.ts` exports `lookupProcessingFee(stripe, { paymentIntentId, checkoutSessionId })`. It returns one of five outcomes: `fee`, `pending` (no balance transaction yet), `not_found` (`resource_missing`), `config_error` (authentication or permission error) or `transient` (rate limit, connection, 5xx). With no intent id it retrieves the checkout session, expanded to `payment_intent.latest_charge.balance_transaction`. Only the webhook turns every outcome except `fee` into NULL, so its insert behaves as today. On the first `config_error` the job stops the run and raises one `error` alert, keyed per run date.
2. **Select the population the Payouts line counts.** Use the predicate of `financial_reconciliation_summary` (`:529-533` and the entry filter at `:544`): `order_type = 'entry'`, then `status IN ('succeeded','refunded') OR refunded_cents > 0 OR make_whole_refunded_cents > 0`, then `stripe_processing_fee_cents IS NULL`. Only orders from the last 30 days, **newest first**, at most 50 a night. Newest first because a recent order is the one most likely to heal; a busy day of unhealable orders then cannot keep a newer order from its turn. Stripe creates the fee within minutes, so an order still missing it after 30 days will not heal by retrying: it ages out of the job and keeps its open alert for a person. A row with neither an intent id nor a checkout session id is skipped and logged.
   - **Measure first.** Run the Payouts population (the predicate above with **no** age limit or cap, so it matches the card's count) against the live database, grouped by whether an intent id is present, before building. The issue saw 5 excluded orders but only 4 alerts. The PR names the fifth order and says why it has no alert. The four 2026-11-01 orders are older than 30 days by the time this ships, so the hand run after deploy passes a one-time `since` of 2026-10-01.
3. **Write the fee and resolve the alert in one transaction.** The job calls RPC `record_order_processing_fee(p_order_id, p_fee_cents, p_note)` (SECURITY DEFINER, service_role only). It sets the fee only `WHERE stripe_processing_fee_cents IS NULL`. The fee is set, never added, so a second run or a late webhook writes nothing and counts nothing twice. In the same transaction it resolves every open alert for that order, matched by key (`processing-fee-pending-<pi>`, or the webhook's fallback key for an order with no intent), and merges `resolution_note` into `detail`. A failure leaves both as they were, so the next night retries both. Each run also resolves open fee alerts whose order already has a fee, for example after a manual backfill, without writing the fee.
4. **The fee write must not fire the enrollment trigger.** Today `trg_stripe_orders_sync_enrollment` fires `BEFORE UPDATE` on every column (`20260914001837_confirm_successful_checkout_enrollments.sql:65`). It can upsert an enrollment (`20261101213300_myk9_1637_card_money_received.sql:332-381`). The migration recreates it as `BEFORE UPDATE OF status, show_id, customer_id, entry_ids, enrollment_id, stripe_payment_intent_id`, which are the only columns the function reads. A fee-only update then never fires it. The two `AFTER UPDATE` triggers are already narrowed to `status` and `entry_ids`.
5. **New alert wording.** The webhook still raises one alert per order on a missing fee, deduped as today. It no longer says "MANUAL BACKFILL REQUIRED". It says: "Stripe processing fee not recorded yet: the nightly job retries it for 30 days." Its code comment and the two UI comments that say nothing retries are rewritten.
6. **Report.** Each run logs one line: "checked, filled, pending, not found, errors". It also sends a Sentry check-in (monitor `cron-stripe-fee-backfill`), and the job appears in `background_jobs` automatically.

The function deploy and `supabase db push` need the owner's go-ahead. The migration takes the `independent` review tier.

## Do nothing, delete it, or link to what exists

- **One-off SQL backfill and keep the alert.** It fixes today's rows, and every later miss again needs a person. The owner chose nightly retry.
- **Let MYK9-1957 report only.** It would flag the gap and never close it.
- **Delete the column.** Not possible: net platform income needs the real fee.
- **Reused:** the webhook's fee read, the summary's own predicate, `alertAdmin`, the Vault cron pattern and the `background_jobs` row.

## Testing

- vitest, with a stubbed Stripe client:
  - each lookup outcome, including a lookup by checkout session when the order has no intent;
  - a `config_error` stops the run and raises one alert;
  - a `transient` error on one order does not stop the others;
  - running twice writes nothing the second time and sends no email;
  - an order older than 30 days is not selected.
- A behavioral SQL test under `supabase/tests/`, run in CI against the real triggers and RPC:
  - a fee-only update on a succeeded order with `enrollment_id` NULL leaves `enrollments` and `entries.registration_id` unchanged, and a status change still syncs;
  - each branch of the selection on its own: a `refunded` order with no refund cents; a `failed` order with only `refunded_cents > 0`; a `failed` order with only `make_whole_refunded_cents > 0` (all three in); a non-entry order and a `failed` order with no refunds (both out);
  - `record_order_processing_fee` writes only into a NULL fee and resolves the alert in the same transaction;
  - an open alert whose order already has a fee is resolved, and the fee is unchanged;
  - the RPC's grants (`proacl`): service_role only.
- After deploy, run the job once by hand with `since` 2026-10-01:
  - before and after, record the Payouts page's excluded count (`processing_fee_pending_count` from `financial_reconciliation_summary('platform')`) and check it falls by the number of fees filled;
  - list the orders still pending, with their intents, joined to their open alerts. The PR says why Stripe cannot return each of them.
