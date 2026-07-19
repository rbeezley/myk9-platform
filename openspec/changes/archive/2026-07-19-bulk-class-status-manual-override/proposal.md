# Bulk Class Status Change with Manual Override + Timing Fields (MYK9-59)

## Why

Bulk class status change was deliberately descoped from MYK9-47 (PR #1376) because a naive
bulk `updateClass({ classStatus })` is wrong three ways: the replication layer strips
`status_source` unless explicitly supplied, so the server's class-status derivation silently
overwrites a manual `Completed`/`In Progress` on the next entry update; the canonical manual
path also sets per-status timing fields (`actual_start_time` / `actual_end_time`) and clears
`reopened_after_closeout_at` on completion; and the per-row status path currently uses a
direct PostgREST write while a replication-backed bulk path would queue offline — row and
bulk would disagree.

Secretaries run classes in groups on show day (start all of a judge's morning classes,
close out a ring). Doing that one row at a time is the exact friction MYK9-47's bulk system
was built to remove. This completes the Class & Entry Operational Clarity project's bulk
grammar and supports fall 2026 launch readiness by making show-day class operations fast,
offline-safe, and consistent with the rest of the bulk system.

## Duplication question

Does this duplicate an existing surface? **No.** It restores the missing `bulk` block on the
existing `classActions` catalog entries, rendered by the existing `ClassBulkActionsBar` via
the existing `toBulkActions` projection and dispatched through the existing
`useBulkDispatch`. No new page, sheet, dialog, or menu. It also *deletes* a divergent path:
the row status change moves off its direct-PostgREST seam onto the same canonical
replication-backed mutation the bulk path uses (and that Show Map already uses), so one
mutation path serves row, bulk, and Show Map.

## What changes

- Extract the canonical manual-status logic (today embedded in `markShowMapClassStarted` /
  `markShowMapClassComplete`) into a shared `applyManualClassStatus(classId, targetStatus)`
  helper covering all user-settable statuses; Show Map delegates to it.
- Re-add the `bulk` block to the class status actions in `classActions.ts` and a
  `handleBulkStatusChange` in `useClassBulkActions`, dispatched through `useBulkDispatch`
  with per-run retry eligibility (a retry re-verifies the class's fresh status still matches
  what it was when the batch ran; superseded rows are skipped, not overwritten).
- Route the per-row status change (`handleStatusChange` on Class Management) through the
  same helper, replacing the direct PostgREST `{ status }` write.

## Non-goals

- No new statuses, no transition-rules engine, no confirmation dialogs beyond what the bulk
  bar already provides.
- No changes to bulk soft-delete, entry bulk actions, or the class-status derivation
  subsystem on the server.
- No `is_completed` writes — the column does not exist in the schema; the `isCompleted`
  field in the replication mapper is read-only defensive mapping and is not part of the
  manual-status contract.
- No admin/role or entry-status surfaces (MYK9-58 is separate).

## Impact

- Specs: `bulk-selection-actions` (added requirements for class bulk status + unified
  manual-status path).
- Code: `apps/myk9show/src` — `components/classes/classActions.ts`,
  `components/classes/useClassBulkActions.ts`, `pages/secretary/ClassManagementPage.tsx`,
  `features/show-map/showMapActionMutations.ts`, new shared
  `services/show-day/classStatusMutations.ts` (or sibling), plus tests.
- No migrations, no edge functions, no deploys.
