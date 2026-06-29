# Final Review Fix Report — 2026-06-28

## Status

FIXED_WITH_DB_EXECUTION_GAP

## Fixes

- Reworked `create_online_paid_entry(...)` so the paid online capacity gate no longer calls the `STABLE` `get_judge_day_capacity(...)` display helper after waiting on the advisory lock. The RPC is now explicit `VOLATILE` and performs the judge-day class lookup, reserve calculation, confirmed-entry count, and `available_spots` decision inline after the lock.
- Fixed the stale signature cleanup by dropping both the prior 10-argument and current 11-argument `create_online_paid_entry(...)` signatures before recreating the RPC.
- Added active waitlist idempotency:
  - `waitlist_entries_active_class_dog_key` unique partial index for active `waiting`/`offered` `(class_id, dog_id)` rows.
  - `add_to_waitlist(...)` returns an existing active dog/class row after auth and class lock instead of inserting a duplicate.
  - `create_online_paid_entry(...)` uses the same active-row return before inserting an overflow waitlist row.
  - Preserved `online`/`mail_in` channel rules and granted the RPC to `authenticated, service_role`.
- Replaced `CartPage` class-level full detection with item-level judge-day capacity splitting. The cart now spends remaining judge-day spots as it walks the cart, so later cart items for the same judge-day become waitlist/blocked when the cart itself consumes the last available spot.
- Changed `checkoutWithWaitlist` from class IDs to cart item IDs so a cart can pay one item in a class/judge-day and waitlist another instead of waitlisting every item in that class.
- Avoided split summary/token creation when there are no waitlisted lines, preventing normal checkout returns from carrying a split token or rendering `Waitlisted: 0`.

## Tests

- Added `cartCapacitySplit.test.ts` for judge-day cart self-consumption and deny-vs-waitlist split decisions.
- Expanded `CartPage.splitCheckout.test.tsx` for item-level overflow splitting and no-token normal checkout.
- Expanded `stripeWebhookCapacityGate.source.test.ts` to assert:
  - `create_online_paid_entry(...)` is `VOLATILE`.
  - capacity enforcement no longer calls `get_judge_day_capacity`.
  - inline capacity count uses `v_capacity - v_confirmed - v_reserved`.
  - overflow waitlist creation is idempotent for active dog/class rows.
- Expanded `waitlistJoinChannel.source.test.ts` to assert active dog/class idempotency and service-role compatibility.

## Verification Run

- `cd apps/myk9show && pnpm exec vitest run src/features/payments/cartCapacitySplit.test.ts src/pages/__tests__/CartPage.splitCheckout.test.tsx src/test/database/stripeWebhookCapacityGate.source.test.ts src/test/database/waitlistJoinChannel.source.test.ts --reporter=verbose`
  - Result: 4 files passed, 19 tests passed.
- `pnpm typecheck`
  - Result: passed.
- `pnpm lint`
  - Result: passed after removing one unused source-test variable.
- `git diff --check`
  - Result: clean.

## Residual Gap

- No live/local Supabase database was pushed or mutated, per instruction. The highest-risk DB behaviors are therefore covered by source/contract tests rather than execution tests:
  - concurrent `create_online_paid_entry(...)` race behavior,
  - partial unique-index behavior against live duplicate data,
  - exact RPC return semantics under Postgres execution.
