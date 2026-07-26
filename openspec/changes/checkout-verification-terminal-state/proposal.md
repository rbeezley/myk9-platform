## Why

Stripe can complete payment before the webhook-created order is visible to myK9Show. The existing
return page stops polling after about 20 seconds, but its ambiguous "Verification Pending" state
does not clearly tell exhibitors that the same payment is still processing or that they must not
start checkout again. Fixing that trust gap protects the fall 2026 launch money path.

## What Changes

- Give the existing `/checkout/success` page explicit success, failed, and still-processing
  outcomes instead of treating every non-success response as the same retry loop.
- Keep verification tied to the original Stripe Checkout Session and make the recovery action check
  that same session without starting a new checkout.
- Tell exhibitors plainly when payment is still processing, that their card must not be submitted
  again, and where they can safely check their entries.
- Preserve the existing cart and server guards that reuse an open Checkout Session and refuse to
  create a replacement after Stripe reports it complete, and fail closed if Stripe cannot inspect
  or expire the prior session safely.
- Add focused tests for terminal outcomes, request deadlines, pending copy, same-session
  verification, and prior-session safety.

This does not duplicate an existing page, dialog, or payment workflow. The canonical Stripe return
page already owns payment confirmation, so a link to another surface would lose the original
session context and make recovery less safe.

Non-goals:

- Changing Stripe sandbox latency or webhook delivery time.
- Adding a new payment-status page, dialog, notification system, or alternate checkout rail.
- Reworking entry creation, Stripe webhook reconciliation, or cart/session persistence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `entry-payment-golden-path`: Online checkout confirmation gains explicit failed and
  still-processing recovery states on the canonical return page.
- `entry-payment-integrity`: Checkout retry and recovery remain bound to the existing Stripe
  session so delayed verification cannot create a second payable session, entry set, or charge.

## Impact

- `apps/myk9show/src/pages/CheckoutSuccessPage.tsx`
- `apps/myk9show/src/lib/stripe.ts`
- `apps/myk9show/supabase/functions/stripe-checkout/index.ts`
- Focused Vitest coverage under `apps/myk9show/src/test/checkout/`
- Behavioral prior-session guard coverage under `apps/myk9show/supabase/functions/_shared/`
