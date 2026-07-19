# Tasks — bulk-class-status-manual-override (MYK9-59)

## 1. Canonical manual-status helper

- [x] 1.1 Create `apps/myk9show/src/services/show-day/classStatusMutations.ts` with
      `applyManualClassStatus(classId, targetStatus)` per the design's per-status payload
      table (statusSource `'manual'` always; timing fields per status; no `isCompleted`
      writes), preserving the existing intent comments about `statusSource` and
      `reopenedAfterCloseoutAt` verbatim from `showMapActionMutations.ts`.
- [x] 1.2 Convert `markShowMapClassStarted` / `markShowMapClassComplete` in
      `features/show-map/showMapActionMutations.ts` into thin delegates to the helper.
- [x] 1.3 Unit tests for the helper: one test per target status asserting the exact
      `replicatedClassesTable.updateClass` payload (statusSource, timing fields present or
      nulled, reopen stamp cleared only on Completed), plus a test that Show Map delegates
      unchanged behavior (update `showMapActionMutations.test.ts` expectations — no
      `isCompleted` in payloads anymore).

## 2. Catalog, bulk handler, and row unification

- [ ] 2.1 `components/classes/classActions.ts`: add `bulk` blocks to the
      `set-status-<status>` actions (label grammar matching the existing bulk actions,
      eligible = `item.status !== status`), add `onBulkStatusChange` to
      `ClassActionHandlers`, and remove the stale descope comment.
- [ ] 2.2 `components/classes/useClassBulkActions.ts`: add `handleBulkStatusChange`
      dispatching `applyManualClassStatus` through the existing `useBulkDispatch` instance,
      with per-run `applicableWhen` capturing each class's pre-batch status so retry skips
      superseded rows; keep the shared busy latch with delete.
- [ ] 2.3 `components/classes/ClassBulkActionsBar.tsx`: wire `onBulkStatusChange` into the
      handlers object.
- [ ] 2.4 `pages/secretary/ClassManagementPage.tsx`: route `handleStatusChange` through
      `applyManualClassStatus` (replacing the direct `updateClassMutation` status write),
      keeping error feedback and ensuring classes query invalidation still happens
      (match the delete path's invalidation if the replication write does not already
      trigger it).
- [ ] 2.5 Tests: catalog projection test (status actions now appear in `toBulkActions`
      output with correct eligible counts); `useClassBulkActions` test for
      retry-skips-superseded (fresh status mismatch → skipped); ClassManagementPage test
      that a row status change queues the replicated payload with
      `statusSource: 'manual'` + timing fields; bulk bar render test updated.

## 3. Verification and ship gate

- [ ] 3.1 Run focused suites: `pnpm vitest run` on the touched test files; then
      `cd apps/myk9show && pnpm test` for the affected shards.
- [ ] 3.2 `pnpm typecheck` and `pnpm lint` (eslint `--max-warnings 0`) clean;
      `pnpm qa:code-quality-ratchet` not regressed (no file pushed over 500 lines).
- [ ] 3.3 Browser verification on a worktree dev server: bulk-start two scheduled classes
      (label shows eligible count, statuses flip, toast summary), row status change while
      offline queues instead of failing, retry path sane.
- [ ] 3.4 PR, CI green, Codex second-opinion review, merge to main (gate for archive).
- [ ] 3.5 Linear MYK9-59 Done on merge; archive change with `archive-summary.md`
      (PR URL + merge evidence), fill any TBD Purpose in promoted specs, stage both halves
      of the archive move.
