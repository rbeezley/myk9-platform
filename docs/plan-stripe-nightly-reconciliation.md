# Nightly check of the app's money records against Stripe

> **Status:** Active

Tracking: MYK9-1957. This plan is design-first because the issue touches money. Nothing is built until the owner chooses an option below.

## What exists today, and why it is shaped that way

The full inventory is on MYK9-1957 (2026-11-28). In short, every comparison with Stripe is set off by one event or covers one show:

- The webhook (`apps/myk9show/supabase/functions/stripe-webhook/index.ts`) books what Stripe sends: checkouts, `charge.refunded`, refund updates, and `charge.dispute.created`. A dispute is alert-only, with no table ("dispute handling stays manual", `:497`). Because the webhook is event-driven, a delivery that never arrives, or that fails until Stripe stops retrying, is never found afterwards.
- The nightly payout job (`cron-process-payouts/payoutReconcile.ts:48`) checks a `show_payouts` row against `transfers.list({transfer_group})`. It does this only for shows it pays that night, or for stale `processing` rows. A transfer that settled earlier is never checked again.
- The club reconciliation badge (`src/features/financial/clubShowReconciliation.ts`) never calls Stripe. The amount tie-out was removed on purpose after MYK9-230 found a "Verified" label that claimed a check which never happened.
- Nothing calls `charges.list`, `paymentIntents.list`, `disputes.list` or `balance.retrieve`.

The health board (`system_health_snapshots`, shown on `/admin/health`) already records ok/warn/fail check results from scheduled runs. It is the existing place where "it ran and found nothing" can be told apart from "it did not run".

## Proposed shape

**One edge function, `cron-stripe-reconcile`.** It is dispatched by pg_cron at 03:30 UTC, after the 02:00 payout run, using the same Vault-secret pattern as `nightly-show-payouts` (`20260619130000_payout_cron_vault_secret.sql`). It reads only. It never writes to `stripe_orders`, `stripe_order_refunds`, `show_payouts` or `entries`, and it issues no refund or transfer.

For a window of the last 7 days by `created` (overlapping windows, so a missed night is covered by the next), it lists from Stripe with pagination and compares:

| Kind     | Stripe side                              | App side                                                                    | A difference is                                               |
| -------- | ---------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Charge   | succeeded PaymentIntents                 | `stripe_orders.stripe_payment_intent_id`, `amount_cents`                    | one side only, or the amounts differ                          |
| Refund   | `refunds.list`                           | `stripe_order_refunds` by `stripe_refund_id`                                | one side only, or the amounts or state differ                 |
| Transfer | `transfers.list`                         | `show_payouts.stripe_transfer_id`, `amount_cents`, `paid_stripe_account_id` | one side only, the amounts differ, or the destination differs |
| Dispute  | `disputes.list`                          | an `operator_alerts` row with dedupe key `dispute-created-<id>`             | a dispute with no alert, so the webhook missed it             |
| Balance  | `balance.retrieve` (available + pending) | money collected for clubs not yet paid out                                  | outside a tolerance; see question 3                           |

**Each difference** raises one `alertAdmin` alert naming both figures and both identifiers. The dedupe key has the form `stripe-reconcile-<kind>-<id>`, so a standing difference alerts once.

**Each run** writes one `system_health_snapshots` row under a new `stripe_reconciliation` check key: `ok` with counts ("41 charges, 3 refunds, 2 transfers compared, 0 differences"), `warn` with the count of differences, or `fail` if Stripe could not be read. The health board's stale-check rule then shows when the check last ran.

**Pure comparison core.** The comparison runs on plain arrays in a Deno-free module (as `send-access-request-emails/records.ts` is) so vitest can cover each kind of difference and the clean case without Stripe.

**No new table and no migration**, apart from the pg_cron schedule. That schedule is a migration: own branch, `independent` review, pushed per the `db-push` skill.

## Options for the owner

1. **Build it as above (recommended).** It closes the gaps that only a person would otherwise find: a missed checkout webhook, an old transfer that changed, and a dispute the webhook dropped. It is read-only, so the worst it can do is raise a wrong alert.
2. **Build charges, refunds and transfers only; leave the balance check out.** The balance check is the hardest to get right (question 3) and the most likely to raise false alarms. The other three are exact matches by Stripe id.
3. **Do nothing until the live cutover (MYK9-11).** Before the cutover there are 19 test-mode orders and no real money. The check pays for itself only once real charges exist. The risk is launching without it, and then the first drift is found by a club.

## Questions the owner decides

1. **Test mode and live mode "separately".** The functions hold one `STRIPE_SECRET_KEY`, and `platform_settings.stripe_livemode` says which mode it is in (today `false`). A second key would be needed to check the other mode on the same night. **Recommendation:** check only the platform's current mode, and record the mode in each snapshot, rather than store a second key.
2. **Rows from before the cutover.** `stripe_orders` has no `livemode` column, so after the cutover every test-mode order would read as "order with no charge". **Recommendation:** compare only app rows created inside the window. A 7-day window clears the test rows a week after the cutover, with no new column. The alternative is a `livemode` column on each money table, which is a migration on money tables.
3. **The balance check needs a definition of "held for clubs"**: collected, minus refunds, minus platform fees, minus paid transfers. Stripe's pending balance also includes processing fees and timing differences. **Recommendation:** option 2, which defers the balance check to its own issue once real money exists to calibrate the tolerance against.

## Testing

- vitest on the comparison core: one test per difference kind (one side only, amount differs, destination differs, a dispute with no alert), plus the clean case writing `ok` with counts.
- An edge-function test with a stubbed Stripe client: pagination across two pages, a Stripe read failure writes `fail`, and no writes reach any money table (the stub client exposes only the selects and inserts the job may call).
- After the deploy: one manual dispatch in test mode reads `ok` on `/admin/health`. A deliberately removed `stripe_order_refunds` row on a throwaway test order raises one alert naming both sides, and then the row is restored.

## Not included

Automatic correction, cash and check payments, and storing disputes in a table. Disputes stay alert-only, as the webhook decided.
