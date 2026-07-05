## Context

`ClassManagementPage.tsx` runs `assignJudgeMutation` with an `onSuccess` but no
`onError`, and drives `handleBulkStatusChange`/`handleBulkDelete` as loops of
`.mutate()` calls that clear the selection unconditionally, before any of the
calls resolve. The page does not import `toast` from `sonner` today, even
though the `<Toaster/>` is already mounted app-wide and the pattern is
established elsewhere (`ClassCreationPage.tsx`). Evidence:
`docs/improve-audit-2026-07/003-surface-mutation-errors.md`.

## Goals / Non-Goals

**Goals:**
- Every judge-assign and bulk class-operation failure shows a visible
  `toast.error`, not just a console log.
- Bulk handlers cannot be double-fired while a batch is still in flight.
- Match the existing toast/testing conventions exactly (no new UI pattern).

**Non-Goals:**
- Converting the bulk `.forEach(.mutate())` loop into a single batched RPC —
  the source plan explicitly defers this; the guard + per-call toast is
  sufficient for now.
- Adding toasts inside the shared `useClassesDatabase.ts` mutation hooks —
  those are consumed elsewhere and page-level messaging is the correct layer.
- Any change to the global `MutationCache.onError` logging backstop.

## Decisions

1. **Toast placement is page-level, not hook-level** — add `onError` at each
   `.mutate()` call site in `ClassManagementPage.tsx`, not inside
   `useUpdateClassMutation`/`useDeleteClassMutation`. *Alternative considered:*
   hook-level toasts — rejected because those hooks are shared across pages
   that may want different messaging or no toast at all.
2. **In-flight guard derives from existing mutation state** — use
   `updateClassMutation.isPending || deleteClassMutation.isPending` rather than
   introducing a new local `useState` flag. *Alternative considered:* a
   separate `isBulkBusy` state variable — rejected as redundant state that
   could drift from the mutations' actual pending status.
3. **Judge-dropdown revert-on-error is conditional, not unconditional** — only
   add revert logic if the dropdown is found to optimistically update local
   state ahead of `onSuccess`; if the value is purely server-derived, the toast
   alone is sufficient (the STOP condition below covers the case where this
   assumption is wrong).

## Risks / Trade-offs

- [Judge dropdown turns out to optimistically write local state not reverted
  on error] → Mitigation: this is a named STOP condition in the source plan —
  verify the mutation's actual behavior before assuming the toast alone
  suffices; if optimistic, add an explicit revert.
- [`if (bulkBusy) return;` breaks an existing bulk test that assumed
  synchronous re-entry] → Mitigation: also a named STOP condition — if a test
  assumed re-entry was safe, that assumption is itself suspect and should be
  reported, not silently worked around.
- [Per-call toasts on a large bulk selection produce toast spam] → Mitigation:
  out of scope for this change (batching is explicitly deferred); acceptable
  given bulk selections are typically small on this page.

## Migration Plan

1. Drift check: confirm `ClassManagementPage.tsx` still matches the source
   plan's "Current state" excerpts; STOP and reconcile if not.
2. Assertion-first: add a failing test for silent judge-assign failure (mock
   `upsertClassJudgeAssignmentMock` to reject, assert `toast.error` — red
   against current code).
3. Add `onError` to `assignJudgeMutation`; verify the test passes.
4. Add per-call `onError` toasts to the bulk handlers; add the `bulkBusy`
   guard and disable bulk buttons while busy.
5. Add tests: bulk delete rejection shows a toast; a bulk handler invoked
   while pending is a no-op.
6. `pnpm typecheck` + `pnpm lint` + full app test suite green.
7. Rollback: client-only change, revert the commit if it regresses.

## Open Questions

- Does the judge dropdown optimistically update before `onSuccess`? Resolves
  during Step 3's implementation, not assumed up front.
