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

## The shape

Two parts: one edge function, `cron-stripe-fee-backfill`, and one migration. The migration carries the trigger change, a small attempts table, three service-role RPCs and the schedule.

1. **A typed lookup, shared.** `_shared/processingFee.ts` exports `lookupProcessingFee(stripe, { paymentIntentId, checkoutSessionId })`. It returns one of five outcomes: `fee`, `pending` (no balance transaction yet), `not_found` (`resource_missing`), `config_error` (authentication or permission error) or `transient` (rate limit, connection, 5xx). With no intent id it retrieves the checkout session, expanded to `payment_intent.latest_charge.balance_transaction`. Only the webhook turns every outcome except `fee` into NULL, so its insert behaves as today. On the first `config_error` the job stops the run and raises one `error` alert, keyed per run date.
2. **Select the population the Payouts line counts.** Use the predicate of `financial_reconciliation_summary` (`:529-533` and the entry filter at `:544`): `order_type = 'entry'`, then `status IN ('succeeded','refunded') OR refunded_cents > 0 OR make_whole_refunded_cents > 0`, then `stripe_processing_fee_cents IS NULL`. A row with neither an intent id nor a checkout session id is reported as `not_found`, keyed by order id. The job does not try to read it from Stripe.
   - **Measure first.** Run this select against the live database, grouped by whether an intent id is present, before building. The issue saw 5 excluded orders but only 4 alerts. The PR names the fifth order and says why it has no alert.
3. **Rotation, so permanent misses cannot starve new orders.** A new table, `stripe_fee_backfill_attempts`, holds `order_id` (primary key), `attempts`, `last_checked_at` and `last_outcome`. It has explicit grants: service_role only, with `REVOKE ALL … FROM anon, authenticated`. Each night takes 50 rows, ordered by `last_checked_at NULLS FIRST, created_at`, and skips any row checked in the last 20 hours. A row that is checked moves to the back. The table lives outside `stripe_orders`, so tracking an attempt is never a write to a money row.
4. **Write the fee and resolve the alert in one transaction.** The job calls RPC `record_order_processing_fee(p_order_id, p_fee_cents, p_note)` (SECURITY DEFINER). It sets the fee only `WHERE stripe_processing_fee_cents IS NULL`. The fee is set, never added, so a second run or a late webhook writes nothing and counts nothing twice. In the same transaction it resolves every open alert for that order and merges `resolution_note` into `detail`. A failure leaves both the fee and the alert as they were, so the next night retries both. The alerts are matched by key, from either source: `processing-fee-pending-<pi>`, or for an order with no intent, the webhook's fallback key built from `cart <metadata.cart_id>` or `payment link <id>`.
5. **The fee write must not fire the enrollment trigger.** Today `trg_stripe_orders_sync_enrollment` fires `BEFORE UPDATE` on every column (`20260914001837_confirm_successful_checkout_enrollments.sql:65`). It can upsert an enrollment (`20261101213300_myk9_1637_card_money_received.sql:332-381`). The migration recreates it as `BEFORE UPDATE OF status, show_id, customer_id, entry_ids, enrollment_id, stripe_payment_intent_id`, which are the only columns the function reads. A fee-only update then never fires it, however many such orders exist later. The two `AFTER UPDATE` triggers are already narrowed to `status` and `entry_ids`.
6. **Close alerts that a person already settled.** Each run first calls RPC `resolve_settled_fee_alerts()`. It resolves any open `processing-fee-pending-*` alert whose order already has a fee, for example after a manual backfill, with the note "fee already recorded". It never writes the fee.
7. **Alert after 3 nights, and take over the old alerts.** The webhook stops alerting and keeps its log line. Its comment and the two UI comments are rewritten. Once an order is more than 3 days old and still missing its fee, the job calls RPC `raise_fee_pending_alert(p_key, p_title, p_detail)`:
   - an open `stripe-webhook` row with that key is updated in place: its source becomes `cron-stripe-fee-backfill` and the title and detail are rewritten, with no new row and no email;
   - if a row already exists under the job's source, nothing changes;
   - otherwise the job inserts through `alertAdmin` with `skipEmailOnDuplicate: true`, which sends one email.

   Each unresolved order therefore has exactly one current alert. The title reads "Stripe processing fee still missing after N nights". The detail gives the intent, the order date, the last outcome, and the fact that this order's net income is not final. Why 3 nights: Stripe normally creates the fee within minutes, so one miss is noise. Three nights rides out an outage, and the alert still comes within the week.

8. **Report.** Each run logs one line: "checked, filled, pending, not found, errors". It also sends a Sentry check-in (monitor `cron-stripe-fee-backfill`), and the job appears in `background_jobs` automatically.

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
  - running twice writes nothing the second time and sends no email.
- vitest for rotation: 50 permanent misses fill one night. On the next night, a newer order whose fee is recoverable is still processed.
- A behavioral SQL test under `supabase/tests/`, run in CI against the real triggers and RPCs:
  - a fee-only update on a succeeded order with `enrollment_id` NULL leaves `enrollments` and `entries.registration_id` unchanged, and a status change still syncs;
  - the selection includes a refunded order and a `succeeded` order with only `make_whole_refunded_cents > 0`, and excludes a non-entry order and a `failed` order with no refunds;
  - `record_order_processing_fee` writes only into a NULL fee, and resolves the alert in the same transaction;
  - `resolve_settled_fee_alerts` closes the alert of an order whose fee was filled in by hand, without changing the fee;
  - `raise_fee_pending_alert` turns a legacy `stripe-webhook` row into the job's row and leaves one unresolved row per key;
  - the attempts table has the grants it should (checked with `relacl`).
- After deploy, run the job once by hand:
  - before and after, record the Payouts page's excluded count (`processing_fee_pending_count` from `financial_reconciliation_summary('platform')`) and check it falls by the number of fees filled;
  - list the orders still pending, with their intents, joined to their open alerts. The Payouts card shows no names, so this is the only way to see which orders remain. The PR says why Stripe cannot return each of them.

## Owner questions

1. **Own cron at 03:00 UTC, or wait and fold it into MYK9-1957?** Recommend its own cron. It ships now, and the checker keeps its "never writes money tables" promise.
2. **Alert after 3 nights?** Recommend 3: long enough to ride out a Stripe outage, short enough to surface within the week.
