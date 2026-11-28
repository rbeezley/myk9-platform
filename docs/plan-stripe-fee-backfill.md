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

**Recommendation: its own small cron, `cron-stripe-fee-backfill`, at 03:00 UTC.** It runs after payouts and before reconciliation. MYK9-1957 then compares a fee that is already filled in. The cost is one more Vault secret and one cron migration.

## The shape

1. **Share the read.** Move `fetchProcessingFeeCents` into `_shared/processingFee.ts` and pass it the Stripe client. The webhook and the job then call the same function, which calls `extractProcessingFeeCents`.
2. **Select.** Service-role read of `stripe_orders` where `stripe_processing_fee_cents IS NULL`, `stripe_payment_intent_id IS NOT NULL` and the summary's scope (`status IN ('succeeded','refunded')`). Oldest `created_at` first, **50 a night**. At most four such rows exist today, so 50 leaves room and keeps Stripe calls low.
3. **Read Stripe.** One `paymentIntents.retrieve` per order. There are three outcomes:
   - **Fee found:** write it.
   - **Still pending, or the call failed:** leave the row; it is retried the next night.
   - **Not found** (`resource_missing`, for example an intent from another mode's key): leave the row and note "Stripe has no such payment" in the alert.
4. **Write.** `UPDATE stripe_orders SET stripe_processing_fee_cents = :fee WHERE stripe_payment_intent_id = :pi AND stripe_processing_fee_cents IS NULL`. The intent id is unique (`005_myk9show_specific.sql:301`). The null guard makes a second run, or a race with a late webhook, write nothing. The fee is set, never added, so it cannot be counted twice. No other column is touched, and no money moves.
   - **Trigger to check when building:** `trg_stripe_orders_sync_enrollment` fires `BEFORE UPDATE` on every column (`20260914001837_confirm_successful_checkout_enrollments.sql:65`). For a succeeded order with `enrollment_id` NULL, a customer and entries, it upserts an enrollment (`20261101213300_myk9_1637_card_money_received.sql:332-381`). Count such pending rows first. If any exist, narrow the trigger to `UPDATE OF status, entry_ids, enrollment_id` in the job's migration.
5. **Resolve.** After a write, resolve any open alert with dedupe key `processing-fee-pending-<pi>` from either source, `stripe-webhook` (the old alerts) or `cron-stripe-fee-backfill`. Merge `{"resolution_note": "Fee <amount> filled in from Stripe by the nightly retry on <date>"}` into `detail`. No schema change is needed.
6. **Alert after 3 nights.** The webhook stops alerting. It keeps its log line, and its comment and the two UI comments are rewritten. The job raises the alert for a row whose `created_at` is more than 3 days old. Source is `cron-stripe-fee-backfill`, the key is unchanged, and `skipEmailOnDuplicate: true` means one email per order. Wording: "Stripe processing fee still missing after N nights", followed by the payment intent, the order date, and the fact that this order's net income is not final. Why 3: Stripe normally creates the balance transaction within minutes, so one miss is noise. Three nights also covers a Stripe or network outage, and the alert still comes well before the weekly money review. Nights are counted from `created_at`, so the job keeps no extra state.
7. **Report.** It logs one line per run: "checked N, filled N, still pending N, not found N". It sends a Sentry check-in (monitor `cron-stripe-fee-backfill`), and the job appears in `background_jobs` automatically. A run-level failure, such as a bad key or a failed select, raises an `error` alert.
8. **The four 2026-11-01 orders.** After deploy, run the job once by hand (curl with the job secret). All four are older than 3 nights, so each is either filled and resolved, or re-alerted with the reason. The PR records which happened and why for any that Stripe cannot return.

Deploying the function and pushing the cron migration need the owner's go-ahead.

## Do nothing, delete it, or link to what exists

- **One-off SQL backfill and keep the alert.** This fixes four rows today, and every future miss again needs a person. The owner chose nightly retry instead.
- **Let MYK9-1957 report only.** That job would flag the gap but never close it, and the Payouts line would stay non-zero.
- **Delete the column.** Net platform income needs the real fee, so this is not an option.
- **Reused, not rebuilt:** the webhook's fee read, the existing partial index, `alertAdmin` dedupe, the Vault cron pattern, and the `background_jobs` health row. The only new surface is one function.

## Testing

- vitest on the pure core, with a stubbed Stripe client:
  - fee available: written once, and its alert resolved with a note;
  - still pending: nothing written, and no alert before 3 nights, one alert after;
  - not found: nothing written, and the alert says so;
  - a Stripe error on one order does not stop the others;
  - run twice: the second run writes nothing and sends no email;
  - an order whose fee is already set is never selected;
  - the cap of 50 is applied oldest first.
- A webhook test: a missing fee still stores NULL, and no alert is raised.
- A guard test that the job writes only `stripe_processing_fee_cents` and `operator_alerts`.
- After deploy: one hand run. The Payouts line reads zero excluded orders, or names the orders Stripe cannot return, and the four alerts are gone from `/admin/health`.

## Owner questions

1. **Own cron at 03:00 UTC, or wait and fold it into MYK9-1957?** Recommend its own cron. It ships now, and the checker keeps its "never writes money tables" promise.
2. **Alert after 3 nights?** Recommend 3: long enough to ride out a Stripe outage, short enough to surface within the week.
