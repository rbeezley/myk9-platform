# Drag-and-Drop Run Order Design

**Date:** 2026-04-05
**Status:** Approved

## Summary

Add drag-and-drop run order editing to the ClassDetailsPage in myK9Show, and surface a live "dogs ahead of you" countdown to exhibitors on the Show Day page.

## Scope

**Secretary view (ClassResultsTable):**

- Drag handle + plain muted gray run order number in the leftmost column
- Active on Pending and All tabs; hidden on Completed tab
- Active for secretaries on any non-closed class; hidden for exhibitors
- Saves immediately on drop (optimistic, no save button)
- Rolls back on failure with error toast

**Exhibitor view (Show Day):**

- "X dogs ahead" countdown on ClassTimelineCard and NextUpCard
- Updates in real time as entries are scored
- Shows "You're next" when count reaches 0 and entry is unscored
- Hidden once the exhibitor's own entry is scored

**Out of scope:**

- Run order number shown to exhibitors (they only see the countdown)
- Push/voice notification when run order changes
- Drag on the Completed tab

## Architecture

### New files

| File                                   | Purpose                                                        |
| -------------------------------------- | -------------------------------------------------------------- |
| `ClassResultsTable/useRunOrderDrag.ts` | Drag sensors, optimistic reorder, persistence, rollback        |
| `ClassResultsTable/SortableRow.tsx`    | Thin wrapper applying `useSortable` bindings to each table row |
| `hooks/queries/useRunOrderPosition.ts` | "Dogs ahead" count with Realtime subscription                  |

### Modified files

| File                                      | Change                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ClassResultsTable/index.tsx`             | Add `DndContext` + `SortableContext` wrapper; add drag handle column on Pending/All tabs |
| `pages/ShowDayPage/ClassTimelineCard.tsx` | Add "dogs ahead" display using `useRunOrderPosition`                                     |
| `pages/ShowDayPage/NextUpCard.tsx`        | Add "You're next" / "X dogs ahead" using `useRunOrderPosition`                           |

## useRunOrderDrag

Lives in `ClassResultsTable/useRunOrderDrag.ts`.

**Inputs:** `entries` (ordered by `run_order`), `classId`, `isEnabled` (false when class is closed or user is not staff)

**State:**

- `orderedIds: string[]` — source of truth for row display order, initialized from `run_order` values
- `isDragging: boolean` — true while a drag gesture is active; blocks remote re-sync during drag

**Behavior:**

- Uses `PointerSensor` (activation distance 8px to prevent accidental mobile drags) and `KeyboardSensor`
- On `dragEnd`: recomputes full sequence, applies optimistically to `orderedIds`, fires `replicatedEntriesTable.updateEntry(id, { run_order: newPosition })` in parallel for all changed rows only
- On persistence failure: restores pre-drag `orderedIds` snapshot and shows error toast
- On remote entry update (Realtime): re-syncs `orderedIds` from new `run_order` values, skipped if `isDragging` is true

**Returns:** `{ orderedIds, isDragging, sensors, onDragStart, onDragEnd }`

## useRunOrderPosition

Lives in `hooks/queries/useRunOrderPosition.ts`.

**Inputs:** `classId`, `myEntryId`

**Computation:** Count of entries in the class where `run_order < myEntry.run_order` AND `is_scored = false`.

**Realtime:** Subscribes to `postgres_changes` on `entries` for the class. Recomputes on any entry update.

**Returns:**

- `dogsAhead: number | null` — null while loading or if entry not found
- `isNext: boolean` — true when `dogsAhead === 0` and own entry is unscored
- `isComplete: boolean` — true when own entry is scored (hide the countdown)

## ClassResultsTable changes

Wrap `<DataTable>` in `<DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>` and `<SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>`.

Each row renders via a `SortableRow` wrapper that calls `useSortable({ id: row.entryId })`. The drag handle (⠿) uses `...attributes` and `...listeners` from `useSortable` so only the handle initiates drag, not the whole row.

New leftmost column (visible on Pending and All tabs when `canEdit && !isClosed`):

```
⠿  1
⠿  2
⠿  3
```

Handle: `text-[#c4c9d4]`, 15px, `cursor-grab`
Number: `text-[#9ca3af]`, 12px, `font-medium`

## Exhibitor Show Day display

`useRunOrderPosition` is called in `ClassTimelineCard` and `NextUpCard` with the exhibitor's `entryId` and `classId`. Display:

- `dogsAhead > 1` → `"X dogs ahead"`
- `dogsAhead === 1` → `"1 dog ahead"`
- `isNext` → `"You're next"`
- `isComplete` → render nothing

Text style: small, muted — secondary to class name and time. Not a badge.

## Data model

No migration needed. `run_order INTEGER` column and `entries_class_run_order_idx` index already exist (migration 003).

Initial `run_order` values for existing entries may be null or non-sequential if never explicitly set. `useRunOrderDrag` handles this by sorting nulls last and treating gaps as valid — the first drag normalizes the sequence.

## Testing

### `useRunOrderDrag.test.ts`

- Initializes `orderedIds` from `run_order` values ascending
- Recomputes sequence correctly on drop
- Fires `updateEntry` only for rows whose position changed
- Rolls back `orderedIds` and shows toast on failure
- Does not re-sync `orderedIds` while `isDragging` is true
- Re-syncs from remote update when not dragging

### `useRunOrderPosition.test.ts`

- Counts unscored entries with lower `run_order` correctly
- Returns `isNext: true` when count is 0 and own entry unscored
- Returns `isComplete: true` when own entry is scored
- Reacts to Realtime entry update (entry scored → count decrements)

### `ClassResultsTable.test.tsx` additions

- Drag handle column visible on Pending tab for secretary, non-closed class
- Drag handle column visible on All tab for secretary, non-closed class
- Drag handle column hidden on Completed tab
- Drag handle column hidden when class is closed
- Drag handle column hidden for exhibitor user
