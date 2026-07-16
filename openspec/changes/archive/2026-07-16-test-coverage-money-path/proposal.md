# Unit-test app-side money logic

## Why

Test-coverage review (2026-07-16, Linear MYK9-37) found the app-side money-movement logic has zero tests while `features/payments` coverage clusters in badges/UI. Refund eligibility, enrollment payment math, and payment processing are the highest-consequence untested pure logic in the app. Pre-launch is the cheapest time to pin this behavior.

## What Changes

Add table-driven Vitest suites — **no production code changes** — for:

- `apps/myk9show/src/components/entries/management/refundEligibility.ts`
- `apps/myk9show/src/components/entries/management/paymentRequestEligibility.ts`
- `apps/myk9show/src/components/entries/management/enrollmentPayment.ts`
- `apps/myk9show/src/services/payment/PaymentService.ts`
- `apps/myk9show/src/hooks/usePaymentProcessing.ts`

Tests assert intended behavior (from JSDoc/INTENT comments and callers), not implementation mirrors. Any behavior that looks like a bug is reported in the PR, not silently encoded as expected.

## Impact

- Affected specs: `testing-money-path` (new)
- Affected code: colocated `*.test.ts(x)` files only
- Risk: low (additive tests); value: pins refund/payment semantics before launch
