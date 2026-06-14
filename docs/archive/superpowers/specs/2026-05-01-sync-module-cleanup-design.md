# Sync Module Cleanup — Design Spec

**Date:** 2026-05-01  
**Scope:** `apps/myk9show/src/hooks/` — Candidate #4 from the architecture improvement backlog

---

## Problem

Four sync-related modules existed in the codebase. Investigation revealed:

| File                        | Lines | Live callers  | Action           |
| --------------------------- | ----- | ------------- | ---------------- |
| `useOfflineSync.ts`         | 465   | 0             | Delete           |
| `usePredictiveSync.ts`      | 390   | 0 (test only) | Delete           |
| `usePredictiveSync.test.ts` | —     | n/a           | Delete with hook |
| `useConflictResolution.ts`  | 458   | 2             | Keep + test      |

`useConflictResolution` contains substantial pure logic (two strategy maps, two entity mappers, a filter, a notification builder) all defined inline and untested. The two live callers are `ConflictNotifications.tsx` and `useRegistrationConflicts.ts`.

---

## Approach

**Option chosen: extract pure helpers + `vi.mock` for hook tests.**

Extract all pure transformations into a sibling utility file. Unit-test them directly (no React, no mocks). Write focused `renderHook` tests for the hook using `vi.mock('@myk9/replication')` to verify wiring.

---

## Files

### Deleted

- `apps/myk9show/src/hooks/useOfflineSync.ts`
- `apps/myk9show/src/hooks/usePredictiveSync.ts`
- `apps/myk9show/src/test/hooks/usePredictiveSync.test.ts`

### Created

- `apps/myk9show/src/hooks/conflictResolutionUtils.ts`
- `apps/myk9show/src/hooks/__tests__/conflictResolutionUtils.test.ts`
- `apps/myk9show/src/hooks/__tests__/useConflictResolution.test.ts`

### Modified

- `apps/myk9show/src/hooks/useConflictResolution.ts` — replace inline logic with calls to utils

---

## `conflictResolutionUtils.ts` Exports

All exports are pure functions or constant maps with no side effects.

```ts
// Status mapping: replication → hook
export const STATUS_MAP: Record<string, ConflictStatus> = {
  pending: 'pending',
  resolved: 'resolved',
  ignored: 'dismissed',
};

// Strategy mapping: replication → hook (for reading resolved conflicts)
export const STRATEGY_FROM_REPLICATION: Record<ConflictStrategy, ResolutionStrategy> = {
  'last-write-wins': 'newest_wins',
  'server-authoritative': 'remote_wins',
  'client-authoritative': 'local_wins',
  'field-level-merge': 'merge_automatic',
};

// Strategy mapping: hook → replication (for resolveConflict writes)
export const STRATEGY_TO_REPLICATION: Record<string, ConflictStrategy> = {
  local_wins: 'client-authoritative',
  remote_wins: 'server-authoritative',
  merge_automatic: 'field-level-merge',
  merge_manual: 'field-level-merge',
  newest_wins: 'last-write-wins',
};

export function mapConflict(c: ReplicationConflict): BaseConflict<Record<string, unknown>>;
export function mapResolution(c: ReplicationConflict): BaseConflictResolution<unknown>;
export function filterByEntityType<T extends { entityType?: string }>(
  items: T[],
  entityType: string | undefined
): T[];
export function buildNotification(
  event: ConflictEvent,
  message: string,
  type: 'warning' | 'error'
): ConflictNotification;
```

`mapConflict` constructs a `BaseConflict` with:

- `status` via `STATUS_MAP[c.status] ?? 'pending'`
- `entityType` defaulting to `'unknown'` when absent
- `priority: 'medium'`, `conflictType: 'sync_conflict'`, `conflictFields: []` (static defaults)
- `lastModified` and `lastModifiedBy` derived from `c.detectedAt`

`mapResolution` constructs a `BaseConflictResolution` with:

- `strategy` via `STRATEGY_FROM_REPLICATION[c.resolution?.strategy] ?? 'merge_automatic'`
- `resolvedAt`, `resolvedBy`, `automatic`, `resolvedEntity` derived from `c.resolution`; all have safe fallbacks when `c.resolution` is undefined

`filterByEntityType` returns the full array when `entityType` is `undefined`; otherwise filters with `item.entityType === entityType`.

`buildNotification` returns `{ id: \`notification-${event.conflictId ?? Date.now()}\`, message, type }`. The caller supplies `message`(pre-formatted) and`type`; the function only contributes the `id` derivation from the event.

---

## `useConflictResolution.ts` Changes

Replace all inline map literals and transformation logic with calls to the utils. The public API (exports, function signatures, return shape) is unchanged. The two live callers require no updates.

---

## Test Plan

### `conflictResolutionUtils.test.ts` (~18 cases)

Plain vitest — no React, no mocks, no async.

| Group                       | Cases                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `STATUS_MAP`                | `pending→pending`, `resolved→resolved`, `ignored→dismissed`                                           |
| `STRATEGY_FROM_REPLICATION` | All 4 strategies map correctly                                                                        |
| `STRATEGY_TO_REPLICATION`   | All 5 strategies map correctly                                                                        |
| `mapConflict`               | All fields populated; `entityType` defaults to `'unknown'`; `status` uses fallback for unknown values |
| `mapResolution`             | All fields populated; `c.resolution` undefined → graceful defaults (no crash)                         |
| `filterByEntityType`        | `undefined` entity type returns all; matching type filters; non-matching returns empty                |
| `buildNotification`         | id uses `notification-${conflictId ?? Date.now()}`; message and type are passed through unchanged     |

### `useConflictResolution.test.ts` (~10 cases)

`renderHook` from `@testing-library/react`; `vi.mock('@myk9/replication')`.

| Case                                                        | What is verified                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| Initial render                                              | Calls `getPendingConflicts`, `getResolutionHistory`, `getConflictStats` |
| `entityType` option                                         | Filters returned conflicts and resolutions                              |
| `conflict_detected` event with `enableNotifications: true`  | Adds notification; calls `refreshConflicts`                             |
| `conflict_detected` event with `enableNotifications: false` | Does not add notification                                               |
| Unmount cleanup                                             | `removeEventListener` called for all 4 event types                      |
| `dismissNotification(id)`                                   | Removes the correct notification; leaves others                         |
| `clearNotifications()`                                      | Removes all notifications                                               |
| `resolveConflict`                                           | Calls `resolveConflictManually` with correct `ConflictStrategy`         |
| `resolveConflict` without user                              | Throws before calling manager                                           |
| `refreshConflicts` when manager throws                      | Sets `error` state; clears `isLoading`                                  |

---

## Out of Scope

- `SyncEngine.ts` (myK9Q) — already tested via mocks; no changes
- `useShowConflictResolution`, `useRegistrationConflictResolution`, `useScoreConflictResolution`, `useFormConflictResolution` — specialized wrappers, covered indirectly by the hook tests
- Adding an in-memory `ConflictManager` adapter — not needed given `vi.mock` achieves the same test isolation at lower cost
