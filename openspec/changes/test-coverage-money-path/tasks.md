# Tasks

## 1. Pure eligibility logic

- [x] 1.1 Add `refundEligibility.test.ts` — table-driven cases over paymentMethod × paymentStatus × refundedAt for `isStripeRefundable`
- [x] 1.2 Add `paymentRequestEligibility.test.ts` — table-driven cases for every exported function
- [x] 1.3 Add `enrollmentPayment.test.ts` — cover amount/derivation logic incl. zero, partial, and edge inputs

## 2. Payment service

- [x] 2.1 Add `PaymentService.test.ts` — cover each public method's decision logic with mocked dependencies (supabase/edge-fn calls mocked at module boundary); assert request payloads and error paths, not just happy path

## 3. Payment processing hook

- [x] 3.1 Add `usePaymentProcessing.test.ts(x)` — renderHook via `src/test/utils/testUtils.tsx` custom render; cover success, failure, and in-flight-guard behavior

## 4. Verification

- [x] 4.1 Focused suites pass: `pnpm vitest run` on the five new files
- [x] 4.2 `pnpm typecheck` clean
