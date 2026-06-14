# Run-Order Propagation: myK9Show → myK9Q

Investigation and fix log for the OPEN-TODOS item _"Verify run-order reorder
propagation to myK9Q — Confirm `RunOrderPage` changes flow through the
replication layer to ringside in real time. Fix if stale. Show-day reorders
must be instant."_

## TL;DR

Class-level reorders made on `apps/myk9show/src/pages/secretary/RunOrderPage`
did **not** reach myK9Q ringside. The write was correct on the show side; the
read was broken on the q side. Symptom on show day: a reordered class list in
myK9Show, an unchanged class list at the ring, with no error to either side.

This PR fixes the read path (and the realtime handler) so reorders propagate
within the existing replication / Supabase realtime debounce window — no new
write paths and no migration.

## What the user does

1. Secretary opens `RunOrderPage` and drags a class to a new position.
2. `RunOrderBoard` calls `onReorder(reorderedClasses)` →
   `handleReorder` in `useRunOrderPageData.ts` →
   `replicatedClassesTable.updateClass(cls.id, { displayOrder: cls.runOrder * DISPLAY_ORDER_STEP })`.
3. The replicated table queues a mutation that flushes to Supabase
   `classes.display_order` (column added in migration 136).

That write was already correct. The bug was downstream.

## Root cause (q side)

`apps/myk9q/src/services/replication/tables/ReplicatedClassesTable.ts`

- The `Class` interface did **not** declare `display_order`. The sync code
  uses `select *`, so the column was being fetched and cached, but the typed
  surface hid it.
- `getByTrialId`, `getByElement`, `getByLevel`, and `getSelfCheckinEnabled`
  all sorted by `cls.class_order`. **`class_order` does not exist on the
  `classes` row** — it is a legacy alias only present on the
  `view_class_summary` Supabase view (kept for a fallback path in
  `useClassListFetch.ts`). On the primary replicated path, `class_order` was
  always `undefined`, so the sort comparator was effectively
  `0 - 0 = 0` for every pair and the list rendered in insertion order from
  IndexedDB.
- `useClassRealtime.ts` handles `postgres_changes` UPDATE events
  optimistically, but the optimistic branch only copies `class_status` and
  `is_scoring_finalized` into local state. A reorder UPDATE on
  `classes.display_order` matched the UPDATE branch and was silently dropped
  — the user only saw the new order after the next manual refetch
  (often: navigating away and back).

The show side already writes the canonical column. The q side needed to
read it.

## Fix

### 1. Add `display_order` to the q-side `Class` interface

`apps/myk9q/src/services/replication/tables/ReplicatedClassesTable.ts`

Adds `display_order?: number` (and keeps `class_order?` as a legacy alias for
the Supabase view fallback). Comment explains the precedence.

### 2. Sort by `display_order` with `class_order` fallback

Same file. Introduces a small helper:

```ts
export function getClassSortKey(cls) {
  if (typeof cls.display_order === 'number') return cls.display_order;
  if (typeof cls.class_order   === 'number') return cls.class_order;
  return Number.MAX_SAFE_INTEGER;
}
```

All four sort sites now use this helper. Unordered rows sink to the end (not
to position 0 as before), and a `display_order` of 0 is respected as a real
value (the previous `|| 0` swallowed it).

### 3. Update the q-side ClassList read path

`apps/myk9q/src/pages/ClassList/hooks/useClassListFetch.ts`

`processClassesWithEntries` (the replicated path) now derives the q-side
`class_order` field from `getClassSortKey(cls)` instead of reading
`cls.class_order` directly. Downstream sorters in this file already chain on
`class_order`, so they pick up `display_order` transparently.

### 4. Realtime: don't swallow reorder UPDATEs

`apps/myk9q/src/pages/ClassList/hooks/useClassRealtime.ts`

When a `postgres_changes` UPDATE on `classes` changes `display_order`, fall
through to `refetch()` instead of the status-only optimistic branch. Status
changes still take the fast path.

### 5. Regression test

`apps/myk9q/src/services/replication/tables/__tests__/ReplicatedClassesTable.test.ts`

Pins the precedence so this can't regress:
- `display_order` wins over `class_order`.
- `class_order` is the fallback.
- `display_order = 0` is honored (not treated as falsy).
- Fully unordered rows sink to the end.
- `getByElement` (which uses `getAll`) honors the new ordering end-to-end.

## What this PR explicitly does **not** change

- **No migration.** `classes.display_order` already exists (migration 136).
  `view_class_summary` (which the Supabase fallback reads) is not under
  source control in this repo and is not touched. The fallback path keeps
  using `class_order` from the view; if/when that view is migrated to alias
  `display_order`, no q-side change is needed.
- **No new write path.** myK9Show still writes `display_order` through
  `replicatedClassesTable.updateClass`. No `class_order` writes anywhere.
- **No debounce on reorders.** Per the constraint in the original todo, the
  fix must not add perceived latency. The write side already coalesces in
  `Promise.allSettled`; the realtime side falls through to the standard
  replication invalidation debounce (500 ms) — same path other class-level
  updates use.

## Verification path for show day

1. `pnpm dev:show` and `pnpm dev:q` simultaneously, on the same trial.
2. Drag a class in myK9Show's `RunOrderPage`.
3. Within the realtime + debounce window (~0.5–1.5 s), myK9Q's ClassList
   reorders to match. No reload required.

## Related code

| Layer | File |
| --- | --- |
| Show write | `apps/myk9show/src/pages/secretary/RunOrderPage/useRunOrderPageData.ts` |
| Show replicated write | `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts` |
| Migration | `supabase/migrations/136_classes_display_order.sql` |
| Q replicated read | `apps/myk9q/src/services/replication/tables/ReplicatedClassesTable.ts` |
| Q list assembly | `apps/myk9q/src/pages/ClassList/hooks/useClassListFetch.ts` |
| Q realtime | `apps/myk9q/src/pages/ClassList/hooks/useClassRealtime.ts` |
| Q legacy view fallback | `view_class_summary` (deployed, not in source) |
