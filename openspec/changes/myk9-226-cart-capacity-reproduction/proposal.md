## Why

MYK9-226 records four August 18 test-mode carts that reached Stripe and were fully refunded after every line was denied for capacity. Before changing a launch-critical payment path, reproduce the reported judge-day-full, `allow_waitlist = false` case against current `main` and determine whether normal exhibitor checkout can still create a payable line.

Original request: "Execute Batch 1 Lane 1G for Linear MYK9-226 as a reproduction-first investigation."

This supports fall 2026 launch readiness by proving that an exhibitor cannot be charged for a line that the server will categorically deny, while avoiding another Stripe session or speculative payment-path change.

## What Changes

- Inventory the registration-wizard, cart-capacity, submit-time recheck, Stripe handoff, and authoritative server-capacity paths.
- Reproduce the exact no-waitlist judge-day-full case at the existing page-level seam without creating a checkout session or mutating shared data.
- Compare the August event timestamps with the deployment history of the submit-time capacity refresh.
- If current `main` reproduces, add the smallest assertion-first fix and focused tests. If it does not reproduce, preserve the evidence and recommend MYK9-226 closure without manufacturing a code change.
- Non-goals: no new UI surface, no duplicate cart or checkout flow, no Stripe session, no charge/refund, no database write, no deployment, and no operator-alert severity change without a separately justified issue.
- Duplication question: this adds no surface. The existing `/cart` route remains the single payment review and capacity-blocking surface; a link or duplicate page would not improve the capacity contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a reproduction and evidence change against existing `cart-integrity` and `entry-capacity-enforcement` behavior. If reproduction uncovers a behavioral gap, the proposal will be amended before implementation.

## Impact

The investigation reads `RegistrationWizardPage`, `registrationCartCheckout`, `CartPage`, `useJudgeDayCapacity`, `cartCapacitySplit`, `cartFulfillmentView`, `stripe-checkout`, and the authoritative capacity migrations. Repository changes are limited to OpenSpec investigation evidence unless current `main` fails the reproduction.
