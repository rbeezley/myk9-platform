## Why

MYK9-294 is a launch-blocking exhibitor trust defect: a payment can succeed while checkout ends at “Payment Not Found Yet.” The money path is correct, but the confirmation path fails during the short period when the exhibitor most needs certainty. This directly conflicts with the fall 2026 launch goal and the exhibitor intent that the software respect their time.

## What Changes

- Identify why a committed `stripe_orders` row can be temporarily unreadable to its owner during checkout confirmation.
- Make a successful payment whose order becomes readable after the initial poll window recover automatically without manual action.
- Preserve the existing warning not to submit a second payment.
- Add regression coverage for an initially empty verification response followed by a successful re-check.
- Keep the existing parked-state and refund messaging truthful for processing, unavailable, and not-found outcomes.

Non-goals:

- No new payment page or alternate confirmation workflow.
- No change to Stripe charging, webhook settlement, refund, or entry-creation behavior unless the root-cause investigation proves one is required.
- No removal of the existing bounded polling and explicit manual status check.

## Capabilities

### New Capabilities

- `checkout-payment-verification-recovery`: automatic recovery from transient post-payment verification gaps.

### Modified Capabilities

- `entry-payment-integrity`: successful payments must reach a truthful confirmation state without requiring the exhibitor to resubmit or manually recover.

## Impact

- `apps/myk9show/src/pages/CheckoutSuccessPage.tsx`
- `apps/myk9show/src/features/payments/checkoutVerification.ts`
- `apps/myk9show/src/lib/stripe.ts` if the investigation identifies an ownership/query issue
- Checkout verification unit and component tests
- Potentially a narrowly scoped database/RLS or observability change, subject to separate review if required
