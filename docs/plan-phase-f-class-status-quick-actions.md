# Plan — Phase F Class Status Quick Actions

**Date:** 2026-05-21
**Status:** Implemented locally.
**Parent plan:** [`docs/plan-phase-f-show-map-row-actions.md`](plan-phase-f-show-map-row-actions.md)

## Goal

Add class lifecycle quick actions to the Show Map row-action surface so a secretary
can mark a class started or complete from the same command menu used for other
show-day work.

This follows the Trial Secretary intent in [`docs/INTENT.md`](INTENT.md): routine
show-day changes should feel calm and one-tap, not like a separate workflow.

## Chosen Mutation Path

Use the existing offline-first class replication path:

- `replicatedClassesTable.updateClass(classId, updates)`
- start updates: `classStatus: 'In Progress'`, `actual_start_time`
- complete updates: `classStatus: 'Completed'`, `actual_end_time`, `isCompleted: true`

This keeps class status changes in the mutation manager / replicated table lane
instead of adding direct Supabase writes.

## Scope

- Add `Mark Class Started` for not-started class rows.
- Add `Mark Class Complete` for in-progress class rows.
- Keep actions in the shared `getRankedActions` contract so the row menu,
  Priority Queue, and guidance surfaces do not diverge.
- Keep routine actions one-tap with success/error toasts from the existing
  executor pattern.
- Keep destructive or ambiguous class workflows out of scope.

## Tests

- Unit-test class action membership for scheduled, active, and completed classes.
- Unit-test execution metadata for the new class-status mutation actions.
- Component/executor test that clicking the row action calls
  `replicatedClassesTable.updateClass` with the expected status fields.
- Re-run focused Show Map action/menu tests, myK9Show typecheck, lint, and
  `git diff --check`.

## Implementation Notes

- `Mark Class Started` is available for not-started class rows and writes
  `classStatus: 'In Progress'`, `actual_start_time`, and `isCompleted: false`.
- `Mark Class Complete` is available for in-progress class rows and writes
  `classStatus: 'Completed'`, `actual_end_time`, and `isCompleted: true`.
- Both actions use the shared Show Map mutation executor and the replicated class
  table, so they remain offline-first and queue through the existing mutation
  manager.

## Out Of Scope

- Confirmation dialogs for routine Start / Complete actions.
- Result finalization, judge signatures, and registry submission.
- New database columns or direct Supabase class-status writes.

## Follow-Up

- Add class-completion guardrails before this becomes the primary wrap-up path:
  hide or confirm `Mark Class Complete` when unresolved score progress, unsigned
  sheets, or registry submission attention remains.
