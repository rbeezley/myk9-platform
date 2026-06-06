# Show-Day Offline Reliability Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove replication bypasses and schema-field drift from core myK9Show secretary/show-day paths.

**Architecture:** Treat show-day operational state as offline-first by default. Route entry check-in and class/entry show-day status changes through replicated tables, keep direct Supabase only for explicitly online-only server workflows, and add focused tests that assert exact column/value writes.

**Tech Stack:** TypeScript, React Query, Vitest, Supabase, `@myk9/replication`, myK9Show shadcn/ui.

---

## Scope

This plan addresses the first releasable slice from the audit:

- Correct the scoring navigation schema bug (`check_in_status` vs `result_status`).
- Consolidate common check-in status writes behind a replicated helper.
- Migrate the highest-traffic secretary/check-in callers to that helper.
- Add tests that fail if check-in values are written to the wrong column or bypass replication.

Larger day-of operations such as late-entry creation, move-up orchestration, and the legacy `OfflineCheckInService` no-op sync rewrite should follow in separate PRs after this slice lands.

## Files

- Create: `apps/myk9show/src/services/show-day/checkInStatus.ts`
- Create: `apps/myk9show/src/services/show-day/__tests__/checkInStatus.test.ts`
- Modify: `apps/myk9show/src/components/scoring/ResultEntryNavigation.tsx`
- Modify: `apps/myk9show/src/components/scoring/__tests__/ResultEntryNavigation.test.tsx` or nearest existing test
- Modify: `apps/myk9show/src/features/show-map/showMapActionMutations.ts`
- Modify: `apps/myk9show/src/features/show-map/__tests__/useShowMapActionExecutor.test.tsx` or nearest existing Show Map mutation test
- Modify: `apps/myk9show/src/hooks/mutations/useCheckInMutation.ts`
- Modify: `apps/myk9show/src/hooks/mutations/__tests__/useCheckInMutation.test.tsx` or create this sibling test if missing
- Modify: `OPEN-TODOS.md` if it has a matching reliability/backlog section

## Task 1: Shared Replicated Check-In Writer

- [ ] Create `apps/myk9show/src/services/show-day/checkInStatus.ts`.
- [ ] Implement `updateReplicatedCheckInStatus(entryId, status)` using `replicatedEntriesTable.updateEntry(entryId, { checkInStatus: status, check_in_status: status })`.
- [ ] Add `checkInStatus.test.ts` mocking `replicatedEntriesTable.updateEntry`.
- [ ] Assert the exact call includes both camel and snake fields and never includes `result_status`.
- [ ] Run:
  `cd apps/myk9show && npx vitest run src/services/show-day/__tests__/checkInStatus.test.ts`

## Task 2: Fix Scoring Navigation Schema Drift

- [ ] Add/update a focused `ResultEntryNavigation` test that triggers check-in status update and expects the replicated helper with `checked-in`.
- [ ] Change `ResultEntryNavigation.tsx` so `updateCheckInStatus` calls the shared helper instead of `useUpdateEntryMutation` with `result_status`.
- [ ] Remove now-unused mutation import/variable if applicable.
- [ ] Run the focused scoring/navigation test.

## Task 3: Migrate Show Map Mark Checked-In

- [ ] Update `markShowMapEntryCheckedIn` in `showMapActionMutations.ts` to call `updateReplicatedCheckInStatus`.
- [ ] Keep class start/complete on `replicatedClassesTable`.
- [ ] Add/update a Show Map mutation/executor test asserting mark checked-in uses the replicated helper and does not call direct Supabase.
- [ ] Run the focused Show Map test.

## Task 4: Migrate Exhibitor/Self Check-In Hook Where Safe

- [ ] Update `useCheckInMutation.ts` to use the shared replicated helper for authenticated app-side check-in status changes that must survive offline.
- [ ] Preserve optimistic React Query cache updates and rollback behavior.
- [ ] Add/update a test that verifies optimistic cache behavior and exact replicated helper call.
- [ ] Note any path that still needs the `self_checkin_entry` RPC because of RLS/server-authority constraints; leave it explicit, not accidental.
- [ ] Run the focused hook test.

## Task 5: Verification and Tracking

- [ ] Run all focused tests added/changed above.
- [ ] Run `cd apps/myk9show && npx vitest run` only if focused suites are quick; stop and report if it hangs over 60 seconds.
- [ ] Run `pnpm typecheck` if feasible; report if pre-existing issues block.
- [ ] Search for remaining direct check-in writes:
  `rg -n "check_in_status|result_status|self_checkin_entry|from\\('entries'\\)" apps/myk9show/src/{components,features,hooks,pages,services} -g '*.ts' -g '*.tsx'`
- [ ] Update `OPEN-TODOS.md` or the relevant tracking doc with remaining follow-up slices: day-of operations offline migration, `OfflineCheckInService` real sync wiring/removal, results release replication.

## Non-Goals For This Slice

- Do not redesign secretary UI.
- Do not rewrite move-up or late-entry orchestration in the same PR.
- Do not push database migrations or deploy functions.
- Do not remove the `self_checkin_entry` RPC unless tests prove every required RLS case is covered by replication.

## Testing Requirement

Every changed writer must have an assertion-first test that verifies the exact value goes to the exact field. The critical regression assertion is that check-in status values are written to `checkInStatus` and `check_in_status`, never to `result_status`.
