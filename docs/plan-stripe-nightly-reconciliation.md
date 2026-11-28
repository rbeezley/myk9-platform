# Nightly check of the app's money records against Stripe

> **Status:** Active

Tracking: MYK9-1957. This plan was design-first because the issue touches money. The owner chose its shape on 2026-11-28 (see **Owner decisions**); building it is MYK9-1957's next step.

## What exists today, and why it is shaped that way

The full inventory is on MYK9-1957 (2026-11-28). In short, every comparison with Stripe is set off by one event or covers one show:

- The webhook (`apps/myk9show/supabase/functions/stripe-webhook/index.ts`) books what Stripe sends: checkouts, `charge.refunded`, refund updates, and `charge.dispute.created`. A dispute is alert-only, with no table ("dispute handling stays manual", `:497`). Because the webhook is event-driven, a delivery that never arrives, or that fails until Stripe stops retrying, is never found afterwards.
- The nightly payout job (`cron-process-payouts/payoutReconcile.ts:48`) checks a `show_payouts` row against `transfers.list({transfer_group})`, including `reversed` and `amount_reversed`. It does this only for shows it pays that night, or for stale `processing` rows. A transfer that settled earlier is never checked again.
- The club reconciliation badge (`src/features/financial/clubShowReconciliation.ts`) never calls Stripe. The amount tie-out was removed on purpose after MYK9-230 found a "Verified" label that claimed a check which never happened.
- Nothing calls `charges.list`, `paymentIntents.list`, `disputes.list` or `balance.retrieve`.
- Not every Stripe object has a counterpart row, and some have a different one:
  - subscription payments, and their refunds, are not entry orders;
  - a charge the app cannot fulfil at all is routed to `refund_requests` for a person to approve (refunds are never automatic). `approvedRefundHasNoOrder` (`_shared/refundSettlement.ts:70`) names these no-order requests;
  - a partly fulfilled cart gets **both** a `stripe_orders` row for the gross charge and a refund request for the unserved lines (`complete_cart_fulfillment`);
  - a refund approved for a no-order request settles its `refund_request_attempts` row and writes no `stripe_order_refunds` row (`routeRefundByCurrentState`, `refundSettlement.ts:449`);
  - `stripe_order_refunds` keeps `failed` and `canceled` refunds on purpose (`20260717122000_stripe_order_snapshots.sql`), and leaves them out of totals;
  - a payout that is awaiting approval, held, or failed before sending has no transfer.

## Owner decisions (2026-11-28)

1. **Scope: charges, refunds, transfers and disputes.** The balance check is its own issue, MYK9-2545, to calibrate once real money exists.
2. **Mode: check only the platform's current mode** (one `STRIPE_SECRET_KEY`), and record the mode on each run.
3. **Test rows: a cutover timestamp.** One column on `platform_settings` records when `stripe_livemode` is switched on, and the switch becomes one-way. How the boundary is applied is under **Mode separation**.

## The shape

**One edge function, `cron-stripe-reconcile`.** It is dispatched by pg_cron at 03:30 UTC, after the 02:00 payout run, using the same Vault-secret pattern as `nightly-show-payouts` (`20260619130000_payout_cron_vault_secret.sql`). It never writes to `stripe_orders`, `stripe_order_refunds`, `refund_request_attempts`, `show_payouts`, `refund_requests` or `entries`, and it issues no refund or transfer. Its only writes are its own last result and the `operator_alerts` rows `alertAdmin` inserts for differences.

**The window finds ids; it does not discard counterparts.** Each night the job collects candidate ids from both sides:

- on the Stripe side, objects `created` in the last 7 days;
- on the app side, rows created or updated in the last 7 days, so a payout approved late, or a refund booked late, is picked up;
- **regardless of age**, every refund that is not yet terminal on either side: a `pending` refund row, an in-flight `refund_request_attempts` row, and any refund id an earlier run left unresolved (carried forward in the job's result). A refund that stays pending past the window, and whose settlement webhook is missed, is therefore still checked.

It then looks up each candidate's counterpart **by id, whatever its date**. A transfer made tonight for a payout row created three weeks ago matches that row instead of reading as one-sided.

| Kind     | Stripe side                                        | App side                                                                                                                                 | Eligible (only these can be "one side only")                                                                                                                                           | A difference is                                                                                                                                              |
| -------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Charge   | succeeded PaymentIntents with entry-order metadata | `stripe_orders` by `stripe_payment_intent_id`. A refund request stands in for the order **only** when `approvedRefundHasNoOrder` says so | Entry checkouts. Subscription payments are excluded.                                                                                                                                   | an eligible charge with no order (and no no-order request); an order whose intent did not succeed; or the order's gross amount differs from the charge       |
| Refund   | refunds whose charge is an eligible entry charge   | `stripe_order_refunds` by `stripe_refund_id`; for a no-order request, the settled `refund_request_attempts` row carrying that refund id  | Terminal refunds (`succeeded`, `failed`, `canceled`) on either side. Subscription refunds are excluded. A refund still pending on both sides is deferred, not drift.                   | one side only once terminal; the amounts differ; or the **terminal states differ** (for example Stripe `succeeded` and the row `failed`, same id and amount) |
| Transfer | transfers with `transfer_group` = a show id        | `show_payouts` by `stripe_transfer_id`                                                                                                   | Rows in `completed`, plus any row carrying a `stripe_transfer_id`. Rows in `pending`, `awaiting_approval`, `approved` and `held`, and `failed` rows with no transfer id, are excluded. | one side only; the **net** amount (`amount` − `amount_reversed`) differs from the row; or the destination differs from `paid_stripe_account_id`              |
| Dispute  | `disputes.list`                                    | an `operator_alerts` row with dedupe key `dispute-created-<id>`                                                                          | All disputes                                                                                                                                                                           | a dispute with no alert, meaning the webhook missed it                                                                                                       |

**Reversals made later.** Every night, transfers are also re-read by id for completed payouts from the last 90 days. A reversal made after the original transfer leaves the 7-day window is still caught. This is the same `reversed`/`amount_reversed` check `payoutReconcile.ts` already makes for the night's shows.

**Mode separation.** Each run uses the platform's current key, and Stripe's responses carry `livemode`, which the run records.

- **The boundary applies to the Stripe transaction, not to the app row.** A row is compared when the Stripe id it carries was returned by the current-mode key, or, for a row with no Stripe id yet, when the row was created after the cutover. A payout row created before cutover and approved after it therefore matches its live transfer.
- A Stripe object is a candidate only if it was created after the cutover.
- **Before any cutover timestamp exists** (test mode today), every row is compared against test-mode Stripe.
- The switch to live is one-way, so a test checkout made during launch preparation is never compared with live Stripe.

**Each difference** raises one `alertAdmin` alert naming both figures and both identifiers. The dedupe key has the form `stripe-reconcile-<kind>-<id>`, with `skipEmailOnDuplicate: true`, so a difference that persists for several nights gives one open row **and one email**.

**Reporting through the regular health run.** The board reads the latest snapshot (`history[0]`), so a reconciliation-only snapshot would hide the other checks until the next regular run, and that run would then leave reconciliation out. Instead:

- The job stores its last result (status, counts, mode, unresolved refund ids and finish time) in one place.
- The regular `cron-health-check` reads that result into a `stripe_reconciliation` check on every snapshot: `ok` with counts ("41 charges, 3 refunds, 2 transfers, 0 disputes compared, 0 differences"), `warn` with the number of differences, or `fail` if Stripe could not be read.
- If the result is more than 26 hours old, the check turns `fail` ("did not run last night") while the other checks carry on.
- **If there is no result at all** once the first scheduled run is due (the schedule's first 03:30 UTC plus 26 hours), the check turns `fail` ("has never run"). Before that it reads `warn` ("first run not due yet").

Where the result is stored (a `platform_settings`-style single row or a small table) is settled when the job is built.

**Pure comparison core.** The comparison runs on plain arrays in a Deno-free module (as `send-access-request-emails/records.ts` is), so vitest can cover each kind of difference and each clean case without Stripe.

The pg_cron schedule and the cutover-timestamp column are migrations: own branch, `independent` review, pushed per the `db-push` skill.

## Testing

- vitest on the comparison core:
  - one test per difference kind: one side only, amounts differ, net-of-reversal amount differs, destination differs, a refund with the same id and amount but different terminal states, a dispute with no alert;
  - one clean-case test per exclusion: a subscription payment and a subscription refund, a no-order charge routed to `refund_requests`, a refund that settled only a `refund_request_attempts` row, a pending refund, an approval-pending payout, a correctly recorded failed refund;
  - a partly fulfilled cart: the order's gross amount is compared with the charge, and a missing order is a difference even though a refund request exists;
  - the late-counterpart case: a payout row created before the window whose transfer was made tonight;
  - a refund pending past the 7-day window that settles with no webhook is still compared.
- An edge-function test with a stubbed Stripe client:
  - pagination across two pages;
  - a Stripe read failure records `fail`;
  - no money table is written; the job's result and alert rows are the only writes;
  - two successive runs with the same difference leave one alert row and send one email.
- A health-runner test: the regular snapshot carries the last reconciliation result; a result older than 26 hours shows `fail` while the other checks stay as they are; no result before the first run is due shows `warn`, and after it is due shows `fail`.
- Mode tests: with no cutover timestamp, test-mode rows are compared; after cutover, test-mode orders created before it report no differences; and a payout row created before cutover whose live transfer was made after it matches.
- After the deploy: one manual dispatch in test mode shows `ok` on `/admin/health`. Then a `stripe_order_refunds` row on a throwaway test order is removed by hand; this must raise one alert naming both sides, and the row is restored afterwards.

## Not included

- Automatic correction.
- Cash and check payments.
- Storing disputes in a table. Disputes stay alert-only, as the webhook decided.
- The balance check (MYK9-2545).
