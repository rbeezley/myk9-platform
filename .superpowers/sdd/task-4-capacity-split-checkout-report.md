# Task 4.5 Step 3 Report — self-service split checkout wiring

## Status

DONE_WITH_CONCERNS

## Scope implemented

Implemented the bounded Task 4.5 Step 3 slice in the feature worktree only:

- Replaced `CartPage`'s flat `createEntryCheckoutSession(cart.id)` handoff with the existing `cartStore.checkoutWithWaitlist(exhibitorId, fullClassIds)` flow.
- Derived full classes from the existing `useJudgeDayCapacity(showId)` hook (`availableSpots <= 0` + `classIds`) instead of inventing schema.
- Preserved Stripe checkout for remaining confirmed/open cart items.
- Blocked pre-checkout when a full cart item is in a class with `allow_waitlist === false`.
- Removed waitlisted cart items before Stripe so the remaining cart total stays payment-only.
- Added a small session-backed summary bridge so the existing checkout success page can show:
  - mixed result: `Paid: N · Waitlisted: M`
  - waitlist-only result: success-page confirmation without Stripe
- Confirmed `add_to_waitlist` ownership/channel constraints from existing source test coverage; no migration written.

## TDD evidence

Assertion-first coverage added before/with implementation:

1. `CartPage` mixed checkout test asserts `checkoutWithWaitlist('exhibitor-1', new Set(['class-full']))`, then checks waitlisted cart removal and Stripe handoff.
2. `CartPage` waitlist-only test asserts no Stripe session is created and navigation goes to the existing success page.
3. `CartPage` denied-full-class test asserts the exact pre-checkout error message and no split/Stripe call.
4. `CheckoutSuccessPage` mixed-return test asserts the persisted split summary renders `Paid: 1 entry`, `Waitlisted: 1 entry`, and the waitlist position.
5. `CheckoutSuccessPage` waitlist-only test asserts the success page renders the waitlist-only confirmation path without session verification.

## Files changed

- `apps/myk9show/src/pages/CartPage.tsx`
- `apps/myk9show/src/pages/CheckoutSuccessPage.tsx`
- `apps/myk9show/src/features/payments/cartSplitCheckoutStorage.ts`
- `apps/myk9show/src/store/cartStore.ts`
- `apps/myk9show/src/store/cartStore.recovery.ts`
- `apps/myk9show/src/store/cartStore.types.ts`
- `apps/myk9show/src/constants/storageKeys.ts`
- `apps/myk9show/src/pages/__tests__/CartPage.splitCheckout.test.tsx`
- `apps/myk9show/src/test/checkout/checkoutSuccess.splitCheckout.test.tsx`

## Tests run

- `cd apps/myk9show && pnpm exec vitest run src/pages/__tests__/CartPage.splitCheckout.test.tsx src/test/checkout/checkoutSuccess.splitCheckout.test.tsx`
  - Result: 2 files passed, 5 tests passed
- `pnpm typecheck`
  - Result: passed

## Commit created

- `4e4e42b19 feat(payments): wire split cart checkout`

## Self-review

- Kept the change on the existing cart + existing checkout success page surfaces; no new payment page or duplicate flow added.
- Verified actual property/schema names used in this slice:
  - `JudgeDayCapacity.availableSpots`
  - `JudgeDayCapacity.classIds`
  - `classes.allow_waitlist`
- Kept server-side atomic enforcement out of scope per instructions.
- Left unrelated worktree changes alone (`OPEN-TODOS.md` remained untouched/uncommitted).

## Concerns

1. The success-page split summary is matched from session storage using `showId` + `confirmedEntryCount` because the current Stripe return route has no session-bound split metadata. In a repeated same-show checkout with the same confirmed count, stale summary data could theoretically render until overwritten by the next checkout.
2. Waitlist rows are created before cart-item removal. If cart-item deletion fails after waitlisting, the flow stops and shows an actionable error, but recovery is not atomic in this client-only slice. That is expected to be superseded by Task 4.5 Step 4 server-side enforcement/atomicity.

---

## 2026-06-28 review fix — stale split-summary correlation

Status: FIXED

- Added a per-checkout `correlationId` to the split summary session record and carried it through both existing success paths:
  - Stripe return: `/checkout/success?session_id=...&split=<correlationId>`
  - Waitlist-only local navigation: `/checkout/success?waitlist=1&split=<correlationId>`
- Updated `createEntryCheckoutSession` to append the split token to the existing success URL without adding a new page or route.
- Replaced the prior broad session-storage read with single-use consume semantics on `CheckoutSuccessPage`.
  - Matching token: summary is applied, then removed.
  - Missing/mismatched/invalid token or payload: summary is cleared and not rendered.
- Added focused coverage proving a stale same-show/same-confirmed-count record does not render on a later checkout return.

Tests run:

- `cd apps/myk9show && pnpm exec vitest run src/pages/__tests__/CartPage.splitCheckout.test.tsx src/test/checkout/checkoutSuccess.splitCheckout.test.tsx`
  - Result: 2 files passed, 6 tests passed
- `pnpm typecheck`
  - Result: passed

Commit:

- `fix(payments): correlate split checkout success summary`

Remaining concern:

- The client still creates waitlist rows before cart-item removal, so a remove failure leaves a non-atomic partial success. That concern is unchanged and belongs to the later server-side enforcement/atomicity step, not this review fix.
