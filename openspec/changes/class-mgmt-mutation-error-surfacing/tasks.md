## 1. Pre-work

- [ ] 1.1 Drift check: `git diff --stat 929240192..HEAD -- apps/myk9show/src/pages/secretary/ClassManagementPage.tsx`; if changed, compare current-state excerpts in the source plan to the live code and STOP on mismatch
- [ ] 1.2 Confirm whether the judge dropdown optimistically updates local
      state ahead of `onSuccess` (determines whether a revert-on-error is
      needed beyond the toast)

## 2. Judge-assign error surfacing

- [ ] 2.1 Mock `sonner` in `ClassManagementPage.judges.test.tsx`
      (`vi.hoisted` + `vi.mock('sonner', ...)`)
- [ ] 2.2 Write failing test: `upsertClassJudgeAssignmentMock` rejects → assert
      `toast.error` called (red against current code, no `onError`)
- [ ] 2.3 Add `import { toast } from 'sonner';` to `ClassManagementPage.tsx`
- [ ] 2.4 Add `onError: () => toast.error('Failed to assign judge. Please try again.')`
      to `assignJudgeMutation`
- [ ] 2.5 If 1.2 found optimistic local state, add the revert-on-error logic
- [ ] 2.6 Run the test from 2.2 green

## 3. Bulk operation error surfacing + double-fire guard

- [ ] 3.1 Write failing test: bulk delete's `deleteClassMutation` rejects →
      assert `toast.error` called (red)
- [ ] 3.2 Write failing test: invoking a bulk handler while a bulk mutation
      `isPending` is a no-op — no additional mutations fire (red)
- [ ] 3.3 Add per-call `onError` toasts to `handleBulkStatusChange`'s and
      `handleBulkDelete`'s `.mutate()` calls
- [ ] 3.4 Add `bulkBusy = updateClassMutation.isPending || deleteClassMutation.isPending`
      and early-return `if (bulkBusy) return;` at the top of both bulk
      handlers
- [ ] 3.5 Disable the bulk action buttons while `bulkBusy`
- [ ] 3.6 Run the tests from 3.1–3.2 green

## 4. Verification and rollout

- [ ] 4.1 `pnpm typecheck` exits 0
- [ ] 4.2 `pnpm lint` exits 0
- [ ] 4.3 `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ClassManagementPage.judges.test.tsx` all pass
- [ ] 4.4 `cd apps/myk9show && pnpm test` whole-suite green
- [ ] 4.5 Confirm only the two in-scope files were modified (`git status`)
- [ ] 4.6 Update `docs/improve-audit-2026-07/README.md` status table (003 row → DONE) and this change's tracking status
