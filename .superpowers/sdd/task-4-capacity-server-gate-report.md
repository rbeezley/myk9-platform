# Task 4.5 Step 4 — Server-Side Atomic Capacity Enforcement

Status: DONE_WITH_CONCERNS

## Implementation

- Added migration `20260628202146_create_online_paid_entry_capacity_gate.sql`.
- Introduced `public.create_online_paid_entry(...)`, a service-role-only `SECURITY DEFINER` RPC for paid online cart entry creation.
- The RPC resolves the class's canonical `trial_id`, `show_id`, and trial date from `classes -> trials`, rejects mismatched paid-cart show/trial inputs, then checks confirmed judge assignments for that class.
- For each confirmed judge-day, the RPC takes the same advisory lock shape used by waitlist promotion:
  `pg_advisory_xact_lock(hashtext('judgeday:' || judge_id || ':' || trial_date))`.
- While holding that lock, it calls `public.get_judge_day_capacity(...)` and blocks insertion when `available_spots <= 0`.
- The entry insert happens in the same database transaction as the lock and capacity read, so online cart creation cannot race past the mail-in reserve.
- Updated `stripe-webhook` paid-cart handling to keep the existing `buildEntryInsert(...)` field mapping/pricing behavior but call the RPC instead of directly inserting into `entries`.

## Tests / TDD Evidence

Red first:

- Added `apps/myk9show/src/test/database/stripeWebhookCapacityGate.source.test.ts`.
- Initial run failed 3/3 because the webhook still inserted directly and no capacity RPC existed.

Green:

- `pnpm exec vitest run src/test/database/stripeWebhookCapacityGate.source.test.ts`
- Result: 1 file passed, 3 tests passed.

Focused regression:

- `pnpm exec vitest run src/test/database/stripeWebhookCapacityGate.source.test.ts src/test/database/stripeWebhookEntryClaim.source.test.ts src/test/database/stripeWebhookWithdrawalSnapshot.source.test.ts src/test/database/stripeWebhookEntryPaymentRequest.source.test.ts`
- Result: 4 files passed, 22 tests passed.

Static checks:

- `git diff --check -- apps/myk9show/supabase/functions/stripe-webhook/index.ts apps/myk9show/src/test/database/stripeWebhookCapacityGate.source.test.ts supabase/migrations/20260628202146_create_online_paid_entry_capacity_gate.sql`
- Result: clean.

Commit-gate checks:

- `pnpm typecheck`
- Result: passed.
- `pnpm lint`
- Result: passed.

## Files Changed

- `apps/myk9show/supabase/functions/stripe-webhook/index.ts`
- `apps/myk9show/src/test/database/stripeWebhookCapacityGate.source.test.ts`
- `supabase/migrations/20260628202146_create_online_paid_entry_capacity_gate.sql`
- `.superpowers/sdd/task-4-capacity-server-gate-report.md`

## Self-Review

- Verified the implementation uses existing `get_judge_day_capacity` semantics and does not add duplicate capacity or overflow columns.
- Verified online enforcement keys off the online cart path only; secretary/mail-in payment-link reconciliation is untouched.
- Verified the RPC is granted only to `service_role` and revokes `PUBLIC`, `anon`, and `authenticated`.
- Preserved paid-cart reconciliation shape: cart claim, entry shortfall alerting, withdrawal snapshot stamping, and `stripe_orders` creation remain in the same order.
- Left the pre-existing `OPEN-TODOS.md` worktree modification untouched.

## Concerns / Limitations

- The schema does not expose an existing online overflow policy that chooses waitlist vs deny. I did not invent `overflow_policy` or `judge_day_entry_limit` columns.
- When a paid cart item is blocked by the server capacity gate, the webhook now prevents the overbooked entry insert and falls into the existing paid-but-missing-entry alert/reconciliation path. That path asks an operator to verify and refund or manually reconcile; it is not an automatic line-item refund.
- This slice is source-tested rather than DB-executed locally; no local Supabase database was pushed or mutated.
