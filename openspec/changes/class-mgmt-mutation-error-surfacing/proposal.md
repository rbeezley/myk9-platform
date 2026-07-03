## Why

On the secretary's Class Management page, judge-assign and bulk status/delete
actions fail **silently**. `assignJudgeMutation` has no `onError`; the bulk
handlers fire N `.mutate()` calls in a loop and immediately clear the selection
as if everything succeeded, with no in-flight guard against a double-fire. The
only error handling today is the global `MutationCache.onError` logger — no
toast, no visible feedback. Concrete cost: a secretary believes a judge is
assigned and classes are updated; on show day, ringside opens a class with no
judge. This is plan 003 from the 2026-07-02 July bug audit
(`docs/improve-audit-2026-07/003-surface-mutation-errors.md`), previously
blocked on Phase 3 UX-remediation edits to the same file landing first (they
have — the dead pencil removal and checkbox labeling from `3.E` are merged),
so it's now unblocked and ready to execute standalone.

## What Changes

- Add `onError` to `assignJudgeMutation` (`ClassManagementPage.tsx:73-86`)
  showing `toast.error('Failed to assign judge. Please try again.')`.
- Add per-call `onError` toasts to the bulk status-change and bulk-delete
  `.mutate()` calls (`ClassManagementPage.tsx:166-180`).
- Add an in-flight guard (`bulkBusy` derived from the mutations' own
  `isPending`) so a double-click cannot fire the bulk batch twice; disable the
  bulk action buttons while busy.

## Capabilities

### New Capabilities
- `class-mgmt-mutation-error-feedback`: visible failure feedback and
  double-fire protection for judge-assign and bulk class operations on the
  secretary Class Management page.

### Modified Capabilities
(none)

## Impact

- Client only: `apps/myk9show/src/pages/secretary/ClassManagementPage.tsx`,
  test file `apps/myk9show/src/pages/secretary/__tests__/ClassManagementPage.judges.test.tsx`
  (add cases, reuse the existing harness). No migration, no edge-function
  deploy.
- Explicitly out of scope (per the source plan): adding toasts inside the
  shared `useClassesDatabase.ts` mutation hooks (page-level messaging is the
  right layer since the hooks are used elsewhere); touching the global
  `MutationCache.onError` logging backstop; converting the bulk loop into a
  single batched mutation.
- Fall 2026 launch: closes a "told me it worked and it didn't" trust-breaking
  failure mode on a secretary golden-path surface before a first club uses it.
  No new UI surface — a fix to existing controls' feedback, not a new
  page/dialog — so no duplication/link question applies.
- Drift check before starting: `git diff --stat 929240192..HEAD -- apps/myk9show/src/pages/secretary/ClassManagementPage.tsx` — if the current-state excerpts in the source plan no longer match the live file, stop and reconcile first.

Full technical detail: `docs/improve-audit-2026-07/003-surface-mutation-errors.md`.
