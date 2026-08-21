## 1. Reproduction contract

- [x] 1.1 Read MYK9-226, its relations/comments, `docs/INTENT.md`, and the Batch 1 lane contract.
- [x] 1.2 Inventory wizard-to-cart, cart capacity, Stripe handoff, and authoritative server capacity paths, including client/server predicate parity for active statuses, confirmed assignments, per-class limits, judge-day limits, and NULL wait-list handling. **[EXPANDED]**
- [x] 1.3 Identify the tight no-charge reproduction command and the exact harmful assertion (`createEntryCheckoutSession` remains uncalled).

## 2. Reproduce and minimize

- [x] 2.1 Run the helper, fulfillment, summary, and real `CartPage` focused tests with a judge-day-full, `allow_waitlist = false` line.
- [x] 2.2 Confirm the minimal scenario stops before `checkoutWithWaitlist` and Stripe session creation.
- [x] 2.3 Compare event timestamps with source history and record the August 20 submit-time refresh that postdates the August 18 incidents.

## 3. Verification

- [x] 3.1 From `apps/myk9show`, run `pnpm exec vitest run src/features/payments/cartCapacitySplit.test.ts src/features/payments/cartFulfillmentView.test.ts src/components/cart/CartSummary.waitlist.test.tsx src/pages/__tests__/CartPage.splitCheckout.test.tsx --sequence.shuffle` at least six times; then run app typecheck, lint, OpenSpec validation, and `git diff --check`. **[EXPANDED]** Six focused runs and OpenSpec/diff checks passed; typecheck/lint exceeded the 60-second no-progress limit and were stopped as documented in `verification-report.md`.
- [x] 3.2 Write the implementation-verification report and confirm no production change is justified.
- [x] 3.3 Commit the investigation evidence locally without pushing or posting externally.

## 4. Coordinator gates

- [ ] 4.1 With approval, record the reproduction and historical-fix evidence on MYK9-226 and close it without a code PR.
- [ ] 4.2 With approval, update the backlog plan, archive/sync the OpenSpec change as appropriate, and push the tracking-only commit.
