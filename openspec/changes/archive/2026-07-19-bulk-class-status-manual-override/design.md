# Design — bulk-class-status-manual-override (MYK9-59)

## Context

MYK9-47 shipped the shared bulk grammar (`EntityAction.bulk` blocks, `toBulkActions`,
`useBulkDispatch`) and Class Management multi-select with bulk soft-delete. Class status
transitions stayed row-only, with an explicit descope comment in
`components/classes/classActions.ts` naming the reason: a correct implementation must set
`status_source: 'manual'` plus per-status timing fields or the server derivation overwrites
the write.

## Offline-first / replication impact

This change is replication-positive: it moves the last direct-PostgREST class status write
(Class Management row `handleStatusChange` → `useUpdateClassMutation` →
`services/database/classes/reads.ts#updateClass`) onto
`replicatedClassesTable.updateClass`, the same path Show Map's
`markShowMapClassStarted/Complete` already use. Result: row, bulk, and Show Map class
status changes all queue offline and all carry `statusSource: 'manual'`.
`stripUnsetServerOwnedKeys` in `ReplicatedClassesTable` keeps `status_source` in the queued
payload precisely because the caller supplies `statusSource` explicitly — that mechanism is
reused as-is, not modified.

## Canonical mutation: one helper, three callers

New `apps/myk9show/src/services/show-day/classStatusMutations.ts`:

```ts
export type ManualClassStatus = ClassStatus; // the CLASS_STATUS union

export async function applyManualClassStatus(
  classId: string,
  targetStatus: ManualClassStatus
): Promise<void>
```

Per-status payloads (all include `classStatus: targetStatus, statusSource: 'manual'`):

| Target status | Additional fields | Rationale |
|---|---|---|
| `In Progress` | `actual_start_time: now` | mirror `markShowMapClassStarted`; deliberately does NOT clear `reopenedAfterCloseoutAt` |
| `Completed` | `actual_end_time: now`, `reopenedAfterCloseoutAt: null` | mirror `markShowMapClassComplete`; manual completion resolves a server reopen, so the attention reason goes with it |
| `Scheduled` / `Upcoming` | `actual_start_time: null`, `actual_end_time: null` | resetting to not-started must not leave stale timing that downstream readiness UIs read as "ran" |
| `Cancelled` | none beyond status+source | cancellation preserves timing history |

`isCompleted` is dropped from the payloads: `is_completed` is not a schema column;
`toSupabaseRow` never emits it, so the existing `isCompleted: true/false` writes in the
Show Map helpers were no-ops beyond the local replica. The helper does not write it, and
the Show Map fns become thin delegates:

```ts
export const markShowMapClassStarted = (id: string) => applyManualClassStatus(id, CLASS_STATUS.IN_PROGRESS);
export const markShowMapClassComplete = (id: string) => applyManualClassStatus(id, CLASS_STATUS.COMPLETED);
```

(Existing `// INTENT:`-adjacent comments about `statusSource: 'manual'` and the
reopen-clearing move into the helper verbatim.)

## Catalog + dispatch wiring (existing layers only)

- `classActions.ts`: each `set-status-<status>` action gains a `bulk` block —
  `applicableWhen: item.status !== status` (inherited), `label: (eligible, selected) =>` e.g.
  `"Mark ${eligible} of ${selected} In Progress"` matching the entry check-in label grammar,
  `run: (items, handlers) => handlers.onBulkStatusChange?.(ids, status)`. Handler contract
  gains `onBulkStatusChange?(classIds: string[], status: ClassStatus)`. Remove the descope
  comment (it is now false).
- `useClassBulkActions.ts`: add `handleBulkStatusChange(classIds, status)` using the
  existing `useBulkDispatch` instance pattern (same as delete): `runItem = cls =>
  applyManualClassStatus(cls.id, status)`, with a **per-run `applicableWhen`** capturing each
  item's status at dispatch time: on retry, a class whose fresh status no longer equals its
  original pre-batch status is reported "no longer eligible" and skipped — retry never
  overwrites a concurrent change. Selection clears on full success via the existing
  `runBulkAndClear` semantics.
- `ClassBulkActionsBar.tsx`: wire `onBulkStatusChange` into the handlers object it already
  builds; rendering falls out of `toBulkActions`.
- `ClassManagementPage.tsx`: `handleStatusChange` calls `applyManualClassStatus` (async, with
  the page's existing mutation error toast pattern) instead of
  `updateClassMutation.mutate({ updates: { status } })`. React Query cache invalidation for
  classes must still fire — reuse the invalidation the replication write path already
  triggers (verify: `useUpdateClassMutation.cacheInvalidation.test.ts` documents the current
  contract; if replication-side invalidation is not automatic, invalidate the classes query
  key in the caller exactly as the delete path does).

## Row/bulk offline unification decision

Decided: **both row and bulk go replication-backed** (option A from the issue). Pre-launch,
no compatibility shim for the old direct path; `useUpdateClassMutation` keeps its other
callers (non-status edits) untouched.

## Emotional intent

Secretary surfaces stay calm and reversible (docs/INTENT.md): the bulk summary toast +
retry/skip semantics come from the existing `useBulkDispatch` contract; no new modal
ceremony. Failure reads as "n of m succeeded" with retry, identical to entry bulk actions.

## Risks

- The direct-path removal changes error-handling shape on the row path (mutation `onError`
  → try/catch around an awaited replication call). Covered by a focused page test.
- Replication queue writes are optimistic; a server-side rejection surfaces later via sync
  machinery, same as Show Map today — accepted, consistent with the offline-first model.
