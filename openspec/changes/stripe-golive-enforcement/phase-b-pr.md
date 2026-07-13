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

## Rollback

Redeploy the previous `stripe-payment-link` version, remove the My Entries offer actions with a follow-up
rollback PR, and disable the payment-link guard trigger only after all still-open promoted offers have
been inventoried. Preserve `entry_payment_links` and waitlist history for reconciliation.
