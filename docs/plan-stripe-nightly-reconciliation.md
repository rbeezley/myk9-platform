# Nightly check of the app's money records against Stripe

> **Status:** Active

Tracking: MYK9-1957. This plan is design-first because the issue touches money. Nothing is built until the owner chooses an option below.

## What exists today, and why it is shaped that way

The full inventory is on MYK9-1957 (2026-11-28). In short, every comparison with Stripe is set off by one event or covers one show:

- The webhook (`apps/myk9show/supabase/functions/stripe-webhook/index.ts`) books what Stripe sends: checkouts, `charge.refunded`, refund updates, and `charge.dispute.created`. A dispute is alert-only, with no table ("dispute handling stays manual", `:497`). Because the webhook is event-driven, a delivery that never arrives, or that fails until Stripe stops retrying, is never found afterwards.
- The nightly payout job (`cron-process-payouts/payoutReconcile.ts:48`) checks a `show_payouts` row against `transfers.list({transfer_group})`, including `reversed` and `amount_reversed`. It does this only for shows it pays that night, or for stale `processing` rows. A transfer that settled earlier is never checked again.
- The club reconciliation badge (`src/features/financial/clubShowReconciliation.ts`) never calls Stripe. The amount tie-out was removed on purpose after MYK9-230 found a "Verified" label that claimed a check which never happened.
- Nothing calls `charges.list`, `paymentIntents.list`, `disputes.list` or `balance.retrieve`.
- Not every Stripe object should have a counterpart row:
  - subscription payments are not entry orders;
  - a charge the app cannot fulfil is routed to `refund_requests` for a person to approve (refunds are never automatic);
  - a payout that is awaiting approval, held, or failed before sending has no transfer.

## Proposed shape

**One edge function, `cron-stripe-reconcile`.** It is dispatched by pg_cron at 03:30 UTC, after the 02:00 payout run, using the same Vault-secret pattern as `nightly-show-payouts` (`20260619130000_payout_cron_vault_secret.sql`). It reads only. It never writes to `stripe_orders`, `stripe_order_refunds`, `show_payouts`, `refund_requests` or `entries`, and it issues no refund or transfer.

**The window finds ids; it does not discard counterparts.** Each night the job collects candidate ids from both sides for objects created or changed in the last 7 days:

- on the Stripe side, by `created`;
- on the app side, by `created_at` or `updated_at`, so a payout approved late, or a refund booked late, is picked up.

It then looks up each candidate's counterpart **by id, whatever its date**. A transfer made tonight for a payout row created three weeks ago therefore matches that row instead of reading as one-sided.

| Kind     | Stripe side                                        | App side                                                                                  | Eligible (only these can be "one side only")                                                                                                                                           | A difference is                                                                                                                                 |
| -------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Charge   | succeeded PaymentIntents with entry-order metadata | `stripe_orders` by `stripe_payment_intent_id`, or a `refund_requests` row for that intent | Entry checkouts. Subscription payments are excluded.                                                                                                                                   | an eligible charge with neither an order nor a refund request; an order whose intent did not succeed; or the amounts differ                     |
| Refund   | succeeded refunds                                  | `stripe_order_refunds` by `stripe_refund_id`                                              | Settled refunds. A pending refund, or an approved refund request whose refund is still in flight, is not drift.                                                                        | one side only once settled, or the amounts differ                                                                                               |
| Transfer | transfers with `transfer_group` = a show id        | `show_payouts` by `stripe_transfer_id`                                                    | Rows in `completed`, plus any row carrying a `stripe_transfer_id`. Rows in `pending`, `awaiting_approval`, `approved` and `held`, and `failed` rows with no transfer id, are excluded. | one side only; the **net** amount (`amount` − `amount_reversed`) differs from the row; or the destination differs from `paid_stripe_account_id` |
| Dispute  | `disputes.list`                                    | an `operator_alerts` row with dedupe key `dispute-created-<id>`                           | All disputes                                                                                                                                                                           | a dispute with no alert, meaning the webhook missed it                                                                                          |
| Balance  | `balance.retrieve` (available + pending)           | money collected for clubs and not yet paid out                                            | All                                                                                                                                                                                    | outside a tolerance; see question 3                                                                                                             |

**Reversals made later.** Every night, transfers are also re-read by id for completed payouts from the last 90 days. A reversal made after the original transfer leaves the 7-day window is still caught. This is the same `reversed`/`amount_reversed` check `payoutReconcile.ts` already makes for the night's shows.

**Mode separation.** Each run uses the platform's current key and records `livemode` from Stripe's responses.

- App rows are compared only if they were created after the cutover boundary.
- The boundary is a timestamp recorded when `platform_settings.stripe_livemode` is switched. It is a one-way switch (question 2).
- A test checkout made during launch preparation is therefore never compared with live Stripe.

**Each difference** raises one `alertAdmin` alert naming both figures and both identifiers. The dedupe key has the form `stripe-reconcile-<kind>-<id>`, with `skipEmailOnDuplicate: true`, so a difference that persists for several nights gives one open row **and one email**.

**Reporting through the regular health run.** The board reads the latest snapshot (`history[0]`), so a reconciliation-only snapshot would hide the other checks until the next regular run, and that run would then leave reconciliation out. Instead:

- The job stores its last result (status, counts, mode and finish time) in one place.
- The regular `cron-health-check` reads that result into a `stripe_reconciliation` check on every snapshot: `ok` with counts ("41 charges, 3 refunds, 2 transfers, 0 disputes compared, 0 differences"), `warn` with the number of differences, or `fail` if Stripe could not be read.
- If the result is more than 26 hours old, the check turns `fail` ("did not run last night") while the other checks carry on.

Where the result is stored (a `platform_settings`-style single row or a small table) is settled when the job is built. Either way it is the job's only write.

**Pure comparison core.** The comparison runs on plain arrays in a Deno-free module (as `send-access-request-emails/records.ts` is), so vitest can cover each kind of difference and each clean case without Stripe.

The pg_cron schedule, and the cutover-boundary column if the owner picks it, are migrations: own branch, `independent` review, pushed per the `db-push` skill.

## Options for the owner

1. **Build charges, refunds, transfers and disputes; leave the balance check for later (recommended).** These four match exactly by Stripe id, and between them they cover the gaps only a person would otherwise find: a missed checkout webhook, a transfer reversed or changed after it was paid, and a dispute the webhook dropped. The balance check moves to its own issue (question 3).
2. **Build all five, balance included.** It is the most complete. The balance check needs a tolerance, and a tolerance can only be set against real money, so it would start with false alarms.
3. **Do nothing until the live cutover (MYK9-11).** Before the cutover there are 19 test-mode orders and no real money. The risk is launching without the check, and the first drift is then found by a club.

## Questions the owner decides

1. **Test mode and live mode "separately".** The functions hold one `STRIPE_SECRET_KEY`, and `platform_settings.stripe_livemode` says which mode it is in (today `false`). Checking the other mode on the same night needs a second stored key. **Recommendation:** check only the current mode, and record the mode on each run.
2. **Keeping test rows out of the first live runs.** `stripe_orders` has no `livemode` column. **Recommendation:** record a cutover timestamp when `stripe_livemode` is switched on, make the switch one-way, and compare only app rows created after it. That is one column on `platform_settings`. The alternative is a `livemode` column on each money table, written by every writer: more migrations on money tables, but it would survive a switch back.
3. **The balance check needs a definition of "held for clubs"**: collected, minus refunds, minus platform fees, minus paid transfers. Stripe's pending balance also includes processing fees and timing differences. **Recommendation:** option 1, which files the balance check as its own issue to calibrate once real money exists. Disputes stay in.

## Testing

- vitest on the comparison core:
  - one test per difference kind: one side only, amounts differ, net-of-reversal amount differs, destination differs, a dispute with no alert;
  - one clean-case test per exclusion: a subscription payment, a charge routed to `refund_requests`, a pending refund, an approval-pending payout;
  - the late-counterpart case: a payout row created before the window whose transfer was made tonight.
- An edge-function test with a stubbed Stripe client:
  - pagination across two pages;
  - a Stripe read failure records `fail`;
  - the only write is the job's own result;
  - two successive runs with the same difference give one alert row and one email.
- A health-runner test: the regular snapshot carries the last reconciliation result, and a result older than 26 hours shows `fail` while the other checks stay as they are.
- A mode test: the first live run, with test-mode orders created before the cutover boundary present, reports no differences for them.
- After the deploy: one manual dispatch in test mode shows `ok` on `/admin/health`. Then a `stripe_order_refunds` row on a throwaway test order is removed by hand; this must raise one alert naming both sides, and the row is restored afterwards.

## Not included

- Automatic correction.
- Cash and check payments.
- Storing disputes in a table. Disputes stay alert-only, as the webhook decided.
- The balance check, under option 1.
