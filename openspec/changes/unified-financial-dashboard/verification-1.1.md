# Task 1.1 — verified source facts (2026-07-17)

## stripe_orders

- Created in `supabase/migrations/005_myk9show_specific.sql:298-324`; amended by 132 (`enrollment_id`) and `20260615170000_stripe_orders_session_id_unique.sql`.
- Columns: `id uuid PK`, `customer_id uuid → stripe_customers`, `stripe_payment_intent_id text UNIQUE`, `stripe_checkout_session_id text` (partial unique idx), `amount_cents int NOT NULL`, `currency text default 'usd'`, `status text CHECK ('pending','processing','succeeded','failed','refunded','cancelled')`, `order_type text`, `metadata jsonb`, `show_id uuid → shows`, `entry_ids uuid[]`, `enrollment_id uuid`, `paid_at`, `refunded_at`, `created_at`, `updated_at`.
- RLS (migration 023, current): select = own via `stripe_customers.person_id = get_my_person_id()` OR `is_platform_admin()`; manage = `is_platform_admin()`. FORCE RLS (021). Legacy `is_platform_admin()` name still in policy body — verify aliasing before relying on it.
- No explicit GRANTs found in migrations for this table.

## show_payouts

- `supabase/migrations/20260609120000_stripe_connect_payouts.sql`. Columns: `id`, `show_id NOT NULL → shows`, `club_stripe_account_id → club_stripe_accounts`, `amount_cents int CHECK >=0`, `status CHECK ('pending','processing','completed','failed')`, `stripe_transfer_id text`, `scheduled_date date`, `failure_reason text`, `completed_at`, timestamps.
- Unique: `show_payouts_one_live_per_show (show_id) WHERE status <> 'failed'`.
- Grants: SELECT→authenticated, ALL→service_role. RLS select policy rewritten in `20260611090000_pr625_round8_write_guards.sql`: `is_site_admin()` OR club-scoped (`is_club_admin(s.club_id)` OR `is_show_secretary(s.id)`).
- Badge resolver: `apps/myk9show/src/features/payments/payoutBadge.ts` — `resolvePayoutBadge(payout, payoutsEnabled)` → labels Paid/Sending/Scheduled/Waiting for account/Retrying/Needs attention. `ShowPayoutRow` in `useClubStripeAccount.ts`.

## operator_alerts

- `supabase/migrations/20260709130000_create_operator_alerts.sql`. Columns: `id`, `created_at`, `source`, `severity CHECK ('info','warn','error')`, `title`, `detail jsonb`, `dedupe_key`, `resolved_at`, `resolved_by`.
- Grants: SELECT→authenticated, INSERT→service_role. Resolution via `resolve_operator_alert(uuid)` SECURITY DEFINER (`is_site_admin()`-gated).
- Inserted from edge functions via `_shared/alertAdmin.ts` `alertAdmin()`.

## Authorization helpers (design.md assumptions CONFIRMED)

- `is_site_admin()` and `is_club_admin(check_club_id uuid default null)`: latest in migration 156, SECURITY DEFINER, STABLE, `search_path=''`.
- `can_manage_show(check_show_id uuid)`: migration 038 (not redefined since).

## Stripe webhook

- `apps/myk9show/supabase/functions/stripe-webhook/index.ts` (~2142 lines), dispatch in `handleEvent()` (line 84).
- `stripe_orders` INSERT happens at THREE sites: `handleEntryPaymentCompleted` (~905, order_type 'entry'), `handleEntryPaymentRequestCompleted` (~1281, 'entry'), `handleOneTimePaymentCompleted` (~1933, 'payment').
- Refunds: webhook `handleChargeRefunded` (line 197) + `handleRefundFailed` (line 147); app-initiated refund fns: `stripe-refund-entry/index.ts`, `stripe-refund-show/index.ts`.
- `balance_transaction` is NOT currently fetched anywhere in edge functions — snapshot work must add it.

## Fee math

- `platform_settings.platform_fee_percent numeric(5,2) default 7` (`20260615180000_platform_settings.sql`).
- Server calc: `functions/_shared/platformFee.ts` (+ test), used by `stripe-checkout`, `stripe-payment-link`, `_shared/entryPaymentLink.ts` (+ test).
- Client preview: `src/hooks/queries/usePlatformFeePercent.ts`; fallback const in `cartStore.helpers.ts`.

## Migration numbering

- Repo switched to timestamp prefixes; latest is `20260716120000_entry_status_history_capture.sql`. Use a later timestamp prefix, not the numeric series (which tops out at 197).

## Pages

- `/club-admin/payments`: `src/pages/club-admin/ClubPaymentsPage.tsx` + `features/payments/ClubPaymentsCard.tsx`, `useClubStripeAccount.ts`.
- `/admin/payouts`: `src/pages/admin/PayoutLedgerPage.tsx` (+ test).
- Financial Report: `src/components/reports/FinancialReport.tsx` + `financialReportTotals.ts` (+ tests); secretary `FinancialSummary.tsx`, `ShowFinancialSummary.tsx`; constants `src/lib/financial-constants.ts`.
