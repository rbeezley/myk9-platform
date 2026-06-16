# Admin Payout Ledger + Platform Fee Setting

> **Status:** Active

Wave 4 item #48 — Richard's explicit pre-launch requirement (2026-06-10). One
page, two halves: a read-only cross-club payout *ledger* and a site-admin
*platform fee setting* that replaces today's three-place manual fee constant.

## Current state (recon 2026-06-15)

**Platform fee lives in three places, all at 7%, that must stay in sync:**

1. Edge default + bounds — `apps/myk9show/supabase/functions/_shared/platformFee.ts:7-8`
   (`DEFAULT_FEE_PERCENT = 7`, `MAX_FEE_PERCENT = 20`, `resolvePlatformFeePercent`).
2. Edge read — `stripe-checkout/index.ts:353` reads `Deno.env.get('PLATFORM_FEE_PERCENT')`.
3. Client preview — `src/store/cartStore.helpers.ts:17-20` (`PLATFORM_FEE_PERCENT = 7`,
   `PLATFORM_FEE_PERCENT_LABEL`), consumed by `CartPreviewPanel.tsx` + `CartSummary.tsx`.

**Payout math:** `_shared/payoutCalc.ts:24-36` `calculateShowPayoutCents(entries)` —
pure TS, no imports, but in the Deno dir (React cannot import it). The cron
(`cron-process-payouts`) already persists results into `show_payouts.amount_cents`.

**Admin scaffolding:** routes `routes/adminRoutes.tsx` (`adminGuard` →
`ProtectedRoute requiredRole={UserRole.SITE_ADMIN}`); pages `src/pages/admin/`;
nav `components/layout/sidebar/unifiedSidebarConfig.ts:119-149`.

**Club-facing (do NOT duplicate):** `features/payments/ClubPaymentsCard.tsx` +
`useClubPayoutHistory` show a single club its own payouts. The admin ledger is the
cross-club, platform-revenue-inclusive complement.

**Tables:** `show_payouts` (amount_cents, status, completed_at, stripe_transfer_id),
`stripe_orders` (amount_cents, status, entry_ids, show_id), `entries`
(payment_method, entry_fee, refund_amount, payment_status).

## Decisions

- **Reuse, don't fork the payout math.** Ledger reads `show_payouts.amount_cents`
  for shows that have a payout row; for *pending* shows (no row), compute with the
  shared formula. Extract `calculateShowPayoutCents` + `PayoutEntry` to a workspace
  package (`@myk9/core` or a small `payments` util) importable by React, with a
  parity test pinning it identical to the Deno `_shared/payoutCalc.ts` copy
  (edge functions still bundle their own copy; the test prevents drift).
- **Fee becomes one DB row.** `platform_settings` single-row table, site-admin-only
  write (RLS + write-guard trigger), read by both stripe-checkout and the cart
  preview. Keep `resolvePlatformFeePercent` 0–20 bounds as validation. Env var
  becomes the fallback only.
- **Split into two PRs** — the backend/fee half is high-stakes (payment flow + RLS +
  migration, gated DB push + edge redeploy); the page half is pure frontend.

## Phase 1 — Platform fee backend (PR 2a, high-stakes)

1. Migration `platform_settings` (id singleton, `platform_fee_percent numeric NOT
   NULL DEFAULT 7 CHECK 0..20`, updated_at/by), seed one row. GRANTs +
   `ENABLE ROW LEVEL SECURITY`. RLS: `authenticated` SELECT (cart preview needs it),
   site-admin-only UPDATE. Write-guard trigger blocks non-site-admin writes
   defense-in-depth. **No INSERT/DELETE** (singleton).
2. `stripe-checkout` reads the row (service role), falls back to
   `resolvePlatformFeePercent(env)` if absent. Keep server-side authority.
3. Cart preview: React Query hook `usePlatformFeePercent()` reads `platform_settings`;
   `cartStore.helpers.ts` consumes the fetched value; delete the hardcoded constant
   (keep the label formatter, fed by the fetched number).
4. Tests: migration-auditor; RLS contract test (non-admin UPDATE rejected); cart
   helper test with injected rate; `usePlatformFeePercent` hook test.
5. Gated: `supabase db push`, `supabase functions deploy stripe-checkout`. Codex review.

## Phase 2 — Admin payout ledger page (PR 2b, frontend)

1. Extract shared payout math + parity test (see Decisions).
2. `usePlatformPayoutLedger()` — site-admin cross-club query: per active show →
   club, online fees collected, refunds, net owed (from `show_payouts.amount_cents`
   or computed when pending), settle date (show end + 3d), payout status/transfer id;
   plus platform revenue (fees + premium) = the operator's slice.
3. `pages/admin/PayoutLedgerPage.tsx` — ledger table + the platform-fee setting input
   (the two halves on one page, per the 2026-06-10 decision). Fee input writes
   `platform_settings` (site-admin only), with optimistic invalidate of the cart hook.
4. Route (`/admin/payouts`, adminGuard) + sidebar nav entry under Admin.
5. Tests: ledger hook math (paid vs pending rows), page render, fee-edit mutation,
   route guard (non-admin redirected).

## Out of scope / deferred

- Per-show / per-club fee override (parked until a club negotiates one).
- Treasurer guide, cron.schedule migration, go-live cutover (separate Wave 4 tail).
