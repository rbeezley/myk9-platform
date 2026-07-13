## Summary

- let an exhibitor pay only for their own active, unexpired waitlist offer through the existing Stripe payment-link and webhook path
- add an owner-only decline function that closes open Checkout Sessions safely and preserves the existing expiry/cascade behavior
- block payment links for stale or otherwise invalid promoted waitlist entries at the database boundary
- add payment, decline, countdown, retry, terminal-state, and deep-link focus behavior to the existing My Entries waitlist rows

Tracked in OpenSpec change: `stripe-golive-enforcement`

## Duplication check

This deliberately extends the existing My Entries `WaitListSection`; it does not add a route, a payment
page, a card form, or a second waitlist workflow. Stripe-hosted Checkout and the established webhook
reconciliation remain the single payment flow.

## Verification

- `pnpm exec vitest run supabase/functions/_shared/waitlistExpiration.test.ts src/test/database/stripePaymentLink.source.test.ts src/test/database/waitlistOfferPayment.source.test.ts src/pages/MyEntriesPage/modules/WaitListSection.test.tsx src/test/database/waitlistOfferUi.source.test.ts` — 31 passed
- `pnpm typecheck`
- `pnpm lint`
- `git diff --check`
- two independent review/fix loops: payment/security and My Entries UX/state review — clean
- full `pnpm test` / direct `vitest run` each stopped reporting just after Vitest started in this local runner; treat the full-suite result as inconclusive and require CI confirmation before merge

## Required deployment order

After merge and explicit approval for shared-system writes:

1. Apply `20260713110000_waitlist_offer_payment_guard.sql`.
2. Deploy `stripe-payment-link` and `decline-waitlist-offer` with `--no-verify-jwt`.
3. Run staging-only, authenticated failure-path checks and a low-value Stripe test-mode offer payment/decline smoke.

Do not run live-mode money, migration, or function writes without separate confirmation.

## Completed staging evidence

- 2026-07-13: migration `20260713110000_waitlist_offer_payment_guard.sql` applied; the follow-up
  dry run reported the remote database up to date.
- `stripe-payment-link` is ACTIVE v12 and `decline-waitlist-offer` is ACTIVE v1. Both return 401
  to unauthenticated no-op requests.
- A controlled E2E exhibitor completed a `cs_test_` Checkout payment for 3,210¢: the promoted
  entry became confirmed/paid/online, the link paid, the offer accepted, and the entry order
  succeeded. A separate controlled `cs_test_` offer was declined: its link expired, entry stayed
  pending without a payment intent, offer became declined, and no order was created.
- Follow-up pending review/deploy: remove the shared builder's card-only payment-method override
  so Stripe Checkout can use Dashboard-configured dynamic payment methods. The assertion-first
  regression test, focused suite, typecheck, lint, and whitespace check pass locally.

## Rollback

Redeploy the previous `stripe-payment-link` version, remove the My Entries offer actions with a follow-up
rollback PR, and disable the payment-link guard trigger only after all still-open promoted offers have
been inventoried. Preserve `entry_payment_links` and waitlist history for reconciliation.
