## Why

The July 12 strict Edge Function audit found that production
`stripe-upgrade-subscription` uses an unrecoverable, deployed-ahead price-list helper. Its behavior
lets `PREMIUM_PRICE_IDS` replace the hardcoded live IDs, which can downgrade a live subscriber if
the secret contains only sandbox IDs. The repository's reviewed helper safely extends live IDs, but
the deployment must not overwrite production until that source-of-truth decision is recorded and
independently verifiable.

This removes the last source-recovery blocker from Phase 0.4 while preserving the remaining
operator-gated Stripe cutover actions for fall 2026 launch readiness.

## What Changes

- Record the recovered deployed helper fingerprint and the explicit decision that repository
  fallback-extension semantics supersede the live replacement semantics.
- Pin the accepted behavior with focused tests that prove configured IDs extend, rather than
  replace, recognized live premium price IDs.
- Update the Edge Function drift audit, go-live tracking, and Stripe cutover preflight contract to
  require a reviewed source decision before `stripe-upgrade-subscription` is deployed.
- Prepare, but do not execute, the separately approval-gated deployment and rollback verification.

This introduces no user-facing surface, page, dialog, or workflow; the change is source recovery
and operational evidence only, so duplication is not applicable.

Non-goals:

- No Stripe live-mode settings, secret changes, price creation, payment, refund, or payout action.
- No Edge Function deployment, including `stripe-upgrade-subscription` or the four helper catch-up
  functions.
- No change to the supported premium-tier business rules beyond documenting the already-reviewed
  fallback-extension behavior.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `go-live-phase-3-stripe-cutover-preflight`: require reviewed source-of-truth and regression-test
  evidence before a deployed-ahead Stripe price helper can be redeployed.

## Impact

- `apps/myk9show/supabase/functions/_shared/premiumPrices.ts` and its focused Vitest contract.
- Edge Function drift audit and Phase 0.4 / Phase 3 go-live tracking.
- The future, explicitly approved `stripe-upgrade-subscription` deployment command and its rollback
  evidence; no shared system is changed by this recovery slice.
