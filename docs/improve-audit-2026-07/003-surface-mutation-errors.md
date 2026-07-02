# Plan 003: Surface failures in judge-assign & bulk class operations

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result. Honor "STOP conditions". Update this plan's row
> in `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 929240192..HEAD -- apps/myk9show/src/pages/secretary/ClassManagementPage.tsx`
> If changed, compare the "Current state" excerpts to the live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UX / operational integrity)
- **Planned at**: commit `929240192`, 2026-07-02

## Why this matters

On the Class Management page a secretary assigns judges and runs bulk
status/delete actions. When any of these **fails**, the secretary is told
**nothing**:

- `assignJudgeMutation` (`ClassManagementPage.tsx:73-86`) has an `onSuccess` but
  **no `onError`**. `handleJudgeChange` fires it and the UI moves on. If the
  assignment fails, the judge silently stays unassigned.
- The only error handling is the global `MutationCache.onError` in
  `apps/myk9show/src/lib/queryClient.ts:22`, which **only logs** — no toast, no
  visible feedback.
- The bulk handlers `handleBulkStatusChange` / `handleBulkDelete`
  (`ClassManagementPage.tsx:166-180`) fire N `.mutate()` calls in a loop and
  immediately `setSelectedClasses([])`, so the selection clears as if everything
  succeeded, even when some calls fail. There is also no in-flight guard, so a
  double-click fires the batch twice.

The concrete cost: a secretary believes judges are assigned and classes updated.
On show day, ringside opens a class with **no judge**. For a first club
evaluating the platform, "it told me it worked and it didn't" is exactly the
trust-breaking failure to avoid.

After this plan: every one of these actions shows a `toast.error` on failure,
the judge-assign selection is not treated as done unless it succeeds, and the
bulk handlers are guarded against double-fire.

## Current state

`apps/myk9show/src/pages/secretary/ClassManagementPage.tsx`:

```ts
// :73-86  — no onError
const assignJudgeMutation = useMutation({
  mutationFn: ({ classId, judgeId }) => {
    if (!showId) throw new Error('Show is required before assigning judges.');
    return upsertClassJudgeAssignment(showId, classId, judgeId);
  },
  onSuccess: () => { /* invalidate queries */ },
});

// :156-158
const handleJudgeChange = (classId, judgeId) => {
  assignJudgeMutation.mutate({ classId, judgeId });
};

// :166-180
const handleBulkStatusChange = (newStatus) => {
  selectedClasses.forEach(classId => {
    updateClassMutation.mutate({ id: classId, updates: { status: newStatus } });
  });
  setSelectedClasses([]);
};
const handleBulkDelete = () => {
  if (confirm(`Are you sure you want to delete ${selectedClasses.length} classes?`)) {
    selectedClasses.forEach(classId => {
      deleteClassMutation.mutate({ id: classId });
    });
    setSelectedClasses([]);
  }
};
```

Conventions to match:
- **Toasts**: `import { toast } from 'sonner';` then `toast.error('…')` /
  `toast.success('…')`. Exemplar: `apps/myk9show/src/pages/secretary/ClassCreationPage.tsx:12,192,195`.
  The `<Toaster/>` is already mounted in `main.tsx`. `ClassManagementPage.tsx`
  does **not** import toast yet — add it.
- `useUpdateClassMutation` / `useDeleteClassMutation` (in
  `apps/myk9show/src/hooks/queries/useClassesDatabase.ts:212,239`) `throw` on
  error, so `onError` fires. They have no per-call toast today.
- **Existing test harness**:
  `apps/myk9show/src/pages/secretary/__tests__/ClassManagementPage.judges.test.tsx`
  already renders the page with `useUpdateClassMutationMock`,
  `useDeleteClassMutationMock`, `upsertClassJudgeAssignmentMock`, and a mocked
  trial store. Reuse it — add cases, don't rebuild the harness.

## Commands you will need

| Purpose   | Command                                                                                                        | Expected |
|-----------|---------------------------------------------------------------------------------------------------------------|----------|
| Typecheck | `pnpm typecheck`                                                                                               | exit 0   |
| One test  | `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ClassManagementPage.judges.test.tsx`         | all pass |
| Lint      | `pnpm lint`                                                                                                    | exit 0   |

## Scope

**In scope**:
- `apps/myk9show/src/pages/secretary/ClassManagementPage.tsx`
- `apps/myk9show/src/pages/secretary/__tests__/ClassManagementPage.judges.test.tsx` (add cases; or a sibling `.errors.test.tsx` if cleaner)

**Out of scope**:
- `useClassesDatabase.ts` mutation hooks — do NOT add toasts inside the shared
  hooks (they're used elsewhere; page-level messaging is the right layer here).
- The global `MutationCache.onError` in `queryClient.ts` — leave it; it's the
  logging backstop, not the user-facing layer.
- Converting the bulk loop into a single batched mutation — out of scope
  (larger change); the guard + per-call error toast is enough for now.

## Git workflow

- Branch: `advisor/003-surface-mutation-errors`
- `fix(class-mgmt): surface judge-assign and bulk action failures to the secretary`
- Do NOT push/PR unless instructed.

## Steps

### Step 1 (assertion-first): failing test for silent judge-assign failure

In the judges test file, add a case: mock `upsertClassJudgeAssignmentMock` to
**reject**, drive a judge selection (the file already does this in its happy-path
test — copy that interaction), then assert a `toast.error` was shown.

Mock sonner at the top of the file:
```ts
const toastErrorMock = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn() } }));
```
Assertion:
```ts
await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
```

**Verify** it FAILS against current code (no onError → no toast):
`cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ClassManagementPage.judges.test.tsx`
→ new case fails. Good.

### Step 2: add `onError` to the judge mutation + guard the selection

- Add `import { toast } from 'sonner';` to `ClassManagementPage.tsx`.
- Add to `assignJudgeMutation`:
  ```ts
  onError: () => {
    toast.error('Failed to assign judge. Please try again.');
  },
  ```
- (Optional but recommended, matching the finding) In `handleJudgeChange`, do
  not treat the assignment as committed until success — since the dropdown value
  is derived from server data that only updates `onSuccess`, no code change may
  be needed beyond the toast; confirm the dropdown reverts to the prior value on
  failure (the mutation doesn't optimistically write). If it does optimistically
  update anywhere, revert on error. If not, leave as-is.

**Verify** the new test passes.

### Step 3: error toasts + in-flight guard for bulk actions

- Add `onError` toasts to the bulk paths. Simplest: pass an `onError` per
  `.mutate()` call, e.g.:
  ```ts
  updateClassMutation.mutate(
    { id: classId, updates: { status: newStatus } },
    { onError: () => toast.error(`Failed to update a class. Some changes may not have saved.`) }
  );
  ```
  and likewise for `deleteClassMutation` in `handleBulkDelete`.
- Add a double-fire guard using the mutations' own pending state:
  ```ts
  const bulkBusy = updateClassMutation.isPending || deleteClassMutation.isPending;
  ```
  and early-return at the top of both bulk handlers: `if (bulkBusy) return;`.
  Also disable the bulk action buttons while `bulkBusy` (match how other
  buttons in this file set `disabled`).

**Verify**: add a test that when a bulk delete's `deleteClassMutation` rejects,
`toast.error` fires; and that invoking a bulk handler while `isPending` is true
does not fire a second batch. Run the file → green.

### Step 4: full gates

`pnpm typecheck` → 0. `pnpm lint` → 0.

## Test plan

- New cases in the judges test file (or a sibling errors test):
  1. judge-assign rejects → `toast.error` called;
  2. bulk delete's mutation rejects → `toast.error` called;
  3. bulk handler is a no-op while a bulk mutation is pending.
- Pattern: the existing `ClassManagementPage.judges.test.tsx` render + userEvent
  interactions.
- Then `cd apps/myk9show && pnpm test` whole-suite green.

## Done criteria (ALL)

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] Judge-assign and bulk tests pass, including the 3 new cases
- [ ] `grep -n "onError" apps/myk9show/src/pages/secretary/ClassManagementPage.tsx`
      shows an onError on the judge mutation
- [ ] `grep -n "from 'sonner'" apps/myk9show/src/pages/secretary/ClassManagementPage.tsx` → present
- [ ] Only the two in-scope files modified (`git status`)
- [ ] `plans/README.md` row for 003 updated

## STOP conditions

- The judge dropdown turns out to optimistically write local state that isn't
  reverted on error in a way this plan didn't anticipate — STOP and report so
  the revert can be specified precisely.
- Adding `if (bulkBusy) return;` breaks an existing bulk test that assumed
  synchronous re-entry — STOP; that assumption may itself be the bug, don't
  paper over it.

## Maintenance notes

- Reviewer check: every user-triggered mutation on secretary pages should have a
  visible failure path, not just the silent `MutationCache` log. This page is
  the template; the same gap likely exists on sibling secretary pages
  (`ShowWorkbenchPage`, entries management) — worth a follow-up sweep, tracked
  separately.
- If the bulk loop is later converted to a single batched RPC, the per-call
  `onError` toasts collapse into one; revisit the messaging then.
