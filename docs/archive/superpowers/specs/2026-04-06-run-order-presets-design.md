# Run Order Preset System — myK9Show

**Date:** 2026-04-06
**Status:** Approved

## Background

myK9Show's `ClassResultsTable` already supports manual drag-and-drop run order via `useRunOrderDrag` + `DndTableView`, persisting to the `run_order` column on the `entries` table. What's missing is a preset picker that lets the secretary apply a bulk ordering in one click (armband ascending, armband descending, random shuffle), rather than dragging each entry individually.

Both myK9Show and myK9Q read from and write to the same `run_order` column on the shared Supabase `entries` table. Run order set in myK9Show is immediately visible to judges and exhibitors in myK9Q, and vice versa.

## Scope

**In:** Preset picker dialog (4 presets), batch mutation, "Set Run Order" button in ClassResultsTable toolbar.

**Out:** Section-aware presets (A then B, B then A). In the platform DB, Section A and Section B are separate classes — there is never a mixed A/B entry list within a single class, so section-aware ordering is not needed.

## Architecture

Three new pieces, all local to `apps/myk9show/`:

### 1. `src/lib/runOrderUtils.ts`

Pure calculation functions — no React, no side effects.

```typescript
export type RunOrderPreset = 'armband-asc' | 'armband-desc' | 'random' | 'manual';

export function calculateRunOrder(
  entries: { id: string; armband: string | null }[],
  preset: RunOrderPreset
): { id: string; runOrder: number }[];
```

- `armband-asc` / `armband-desc`: sort by `parseInt(armband ?? '0', 10)`, nulls sort to end
- `random`: Fisher-Yates shuffle
- `manual`: returns empty array (hook no-ops, dialog closes via normal success path; drag handles are already visible in the table)

Returns 1-based `runOrder` values with no gaps.

### 2. `src/components/classes/RunOrderDialog.tsx`

shadcn `Dialog` component with 4 preset options rendered as radio-style cards (same visual pattern as myK9Q screenshots). Manages its own selected preset state.

Props:

```typescript
interface RunOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryCount: number;
  onApply: (preset: RunOrderPreset) => Promise<void>;
}
```

The dialog owns `isApplying` state by awaiting the `onApply` promise internally. On success, the dialog closes itself via `onOpenChange(false)`. On failure, it stays open (the hook already surfaced the error toast).

- Apply button disabled until a preset is selected
- Apply button and Cancel disabled while `isApplying` (internal dialog state)
- Dialog not dismissable (no outside-click close, `onOpenChange` ignored) while applying
- On Apply click: sets `isApplying = true`, awaits `onApply(preset)`, then calls `onOpenChange(false)` on success or clears `isApplying` on failure
- "Manual Drag and Drop" option: `onApply('manual')` resolves immediately; dialog closes via the same success path

### 3. `src/components/classes/ClassResultsTable/useRunOrderPreset.ts`

Hook that wires calculation → batch mutation → cache invalidation.

```typescript
export function useRunOrderPreset(classId: string | undefined, rawEntries: RawEntryRow[]) {
  return { applyPreset, isApplying };
}
```

- `applyPreset(preset)`: calls `calculateRunOrder`, then `replicatedEntriesTable.updateEntry(id, { runOrder })` for each entry sequentially
- On success: invalidates `['classes', classId, 'entries']` query key
- On failure: calls `notifications.error('Failed to set run order')`, does not throw (dialog stays open for retry)
- `isApplying` is `true` during the update loop

## Integration

In `ClassResultsTable/index.tsx`:

- Add `useState` for `runOrderDialogOpen`
- Add "Set Run Order" button to the header toolbar, visible when `canEdit && !isClosed`
- Render `<RunOrderDialog>` controlled by `runOrderDialogOpen`
- `onApply` callback passed to dialog: calls `applyPreset(preset)` for all presets including `'manual'` (hook no-ops for manual and resolves immediately); dialog closes itself on success

## Data Flow

```
Secretary clicks "Set Run Order"
  → RunOrderDialog opens
  → Secretary selects preset, clicks Apply
  → useRunOrderPreset.applyPreset(preset)
    → calculateRunOrder(rawEntries, preset) → [{id, runOrder}]
    → replicatedEntriesTable.updateEntry(id, { runOrder }) × N
    → queryClient.invalidateQueries(['classes', classId, 'entries'])
  → rawEntries refetches → useRunOrderDrag re-sorts table
  → myK9Q replication sync picks up new run_order values
```

No optimistic table re-render for preset applies — the refetch is fast and avoids any UI flash. Drag-and-drop continues to use its existing optimistic override pattern unchanged.

## Error Handling

- Batch failure: `notifications.error('Failed to set run order')` — dialog stays open, secretary can retry
- No partial rollback: entries already updated keep their new `run_order`; secretary can re-apply the same preset to fix
- Null armbands: parsed as `0`, sort to beginning of ascending / end of descending

## Testing

### `src/lib/__tests__/runOrderUtils.test.ts` (~15 tests)

- Armband ascending: sorted correctly, 1-based output
- Armband descending: sorted correctly, 1-based output
- Random: all entries present, order changed (probabilistic, seeded mock)
- Null armband entries: sort to end for asc, beginning for desc
- Single entry: returns `[{ id, runOrder: 1 }]`
- Empty array: returns `[]`

### `src/components/classes/__tests__/RunOrderDialog.test.tsx` (~10 tests)

- Apply disabled when no preset selected
- Apply enabled after selection
- Calls `onApply` with correct preset on Apply click
- `'manual'` preset calls `onApply('manual')`
- Apply and Cancel disabled while `isApplying`
- Dialog not closeable via outside click while applying

### `src/components/classes/ClassResultsTable/__tests__/useRunOrderPreset.test.ts` (~8 tests)

- Calls `updateEntry` for every entry in correct 1-based order
- Invalidates query cache on success
- `isApplying` true during update, false after
- Calls `notifications.error` on failure
- Does not throw on failure
- No-ops when `classId` is undefined
