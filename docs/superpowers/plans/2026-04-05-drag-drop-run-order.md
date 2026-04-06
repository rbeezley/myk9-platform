# Drag-and-Drop Run Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secretary drag-and-drop run order editing to ClassResultsTable and surface a live "dogs ahead of you" countdown to exhibitors on the Show Day page.

**Architecture:** A dedicated `useRunOrderDrag` hook owns sensors, optimistic reorder, and persistence. A `SortableRow` + `DragHandleCell` component pair handles per-row dnd-kit bindings. When drag is active (secretary, non-closed, Pending/All tab), ClassResultsTable renders a manual table with SortableRow wrappers instead of the DataTable component. Exhibitor cards compute "dogs ahead" inline from already-available `ShowDayClass` fields (`myRunningOrder`, `scoredEntries`), updated by a Realtime subscription on ring progress.

**Tech Stack:** @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities (all already installed), @tanstack/react-table (already installed), Supabase Realtime postgres_changes, React Query invalidation.

---

## File Map

| Action | Path                                                                                               | Responsibility                                               |
| ------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Modify | `apps/myk9show/src/hooks/queries/useClassEntriesRaw.ts`                                            | Add `run_order` field to `RawEntryRow`                       |
| Modify | `apps/myk9show/src/services/database/queries/entry-query-lookups.ts`                               | Order `getEntriesByClass` by `run_order`                     |
| Create | `apps/myk9show/src/components/classes/ClassResultsTable/useRunOrderDrag.ts`                        | Sensors, optimistic reorder, persistence, rollback           |
| Create | `apps/myk9show/src/components/classes/ClassResultsTable/SortableRow.tsx`                           | SortableRow + DragHandleCell using Context                   |
| Modify | `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`                                 | Wire drag, render DnD table when active                      |
| Create | `apps/myk9show/src/hooks/useShowDayRealtime.ts`                                                    | Realtime subscription to invalidate ring-progress on scoring |
| Modify | `apps/myk9show/src/pages/ShowDayPage.tsx`                                                          | Mount `useShowDayRealtime`                                   |
| Modify | `apps/myk9show/src/components/exhibitor/ClassTimelineCard.tsx`                                     | Render dogs-ahead count                                      |
| Modify | `apps/myk9show/src/components/exhibitor/NextUpCard.tsx`                                            | Render dogs-ahead / "You're next"                            |
| Create | `apps/myk9show/src/components/classes/ClassResultsTable/__tests__/useRunOrderDrag.test.ts`         | Hook unit tests                                              |
| Create | `apps/myk9show/src/components/classes/ClassResultsTable/__tests__/drag-handle-visibility.test.tsx` | Integration: column visible/hidden per tab/role              |
| Modify | `apps/myk9show/src/test/components/ClassTimelineCard.test.tsx`                                     | Dogs-ahead display tests                                     |
| Modify | `apps/myk9show/src/test/components/NextUpCard.test.tsx`                                            | Dogs-ahead display tests                                     |

---

## Task 1: Add `run_order` to `RawEntryRow` and fix query ordering

**Files:**

- Modify: `apps/myk9show/src/hooks/queries/useClassEntriesRaw.ts`
- Modify: `apps/myk9show/src/services/database/queries/entry-query-lookups.ts`

- [ ] **Step 1: Add `run_order` to `RawEntryRow` interface**

In `useClassEntriesRaw.ts`, add `run_order` after `check_in_status`:

```typescript
// Before:
check_in_status: string | null;
dog: { ... } | null;

// After:
check_in_status: string | null;
run_order: number | null;
dog: { ... } | null;
```

- [ ] **Step 2: Change `getEntriesByClass` to order by `run_order`**

In `entry-query-lookups.ts`, find `getEntriesByClass` (~line 330). Change the order call:

```typescript
// Before:
.order('armband', { ascending: true });

// After:
.order('run_order', { ascending: true, nullsFirst: false });
```

- [ ] **Step 3: Run the unit tests to confirm no regressions**

```bash
cd apps/myk9show && npx vitest run src/hooks/queries/useClassEntriesRaw
```

Expected: PASS (or no test file — that's fine, move on).

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useClassEntriesRaw.ts \
        apps/myk9show/src/services/database/queries/entry-query-lookups.ts
git commit -m "feat(run-order): add run_order to RawEntryRow, order entries by run_order"
```

---

## Task 2: Create `useRunOrderDrag` hook

**Files:**

- Create: `apps/myk9show/src/components/classes/ClassResultsTable/useRunOrderDrag.ts`
- Create: `apps/myk9show/src/components/classes/ClassResultsTable/__tests__/useRunOrderDrag.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/myk9show/src/components/classes/ClassResultsTable/__tests__/useRunOrderDrag.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRunOrderDrag } from '../useRunOrderDrag';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

// Mock replicatedEntriesTable
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock notifications
vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn() },
}));

function makeEntry(id: string, runOrder: number | null): RawEntryRow {
  return {
    id,
    class_id: 'c1',
    show_id: 's1',
    dog_id: 'd1',
    handler_id: null,
    armband: null,
    handler: null,
    result_status: null,
    is_scored: false,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: null,
    check_in_status: null,
    run_order: runOrder,
    dog: null,
    created_at: null,
    updated_at: null,
  };
}

describe('useRunOrderDrag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes orderedIds from run_order ascending', () => {
    const entries = [makeEntry('e3', 3), makeEntry('e1', 1), makeEntry('e2', 2)];
    const { result } = renderHook(() =>
      useRunOrderDrag({ rawEntries: entries, classId: 'c1', isEnabled: true })
    );
    expect(result.current.orderedIds).toEqual(['e1', 'e2', 'e3']);
  });

  it('sorts null run_order entries last', () => {
    const entries = [makeEntry('eA', null), makeEntry('e1', 1), makeEntry('e2', 2)];
    const { result } = renderHook(() =>
      useRunOrderDrag({ rawEntries: entries, classId: 'c1', isEnabled: true })
    );
    expect(result.current.orderedIds[2]).toBe('eA');
  });

  it('fires updateEntry only for rows whose position changed after drag', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const entries = [makeEntry('e1', 1), makeEntry('e2', 2), makeEntry('e3', 3)];
    const { result } = renderHook(() =>
      useRunOrderDrag({ rawEntries: entries, classId: 'c1', isEnabled: true })
    );

    // Simulate dragging e1 to position 3 (e1→3, e2→1, e3→2)
    await act(async () => {
      result.current.onDragStart({ active: { id: 'e1' } } as Parameters<
        typeof result.current.onDragStart
      >[0]);
      await result.current.onDragEnd({
        active: { id: 'e1' },
        over: { id: 'e3' },
      } as Parameters<typeof result.current.onDragEnd>[0]);
    });

    // New order: e2, e3, e1 → positions 1, 2, 3
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(3);
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('e2', { runOrder: 1 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('e3', { runOrder: 2 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('e1', { runOrder: 3 });
  });

  it('rolls back orderedIds and shows error toast on persistence failure', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { notifications } = await import('@/lib/notifications');
    (replicatedEntriesTable.updateEntry as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('network error')
    );

    const entries = [makeEntry('e1', 1), makeEntry('e2', 2)];
    const { result } = renderHook(() =>
      useRunOrderDrag({ rawEntries: entries, classId: 'c1', isEnabled: true })
    );
    const originalOrder = [...result.current.orderedIds];

    await act(async () => {
      result.current.onDragStart({ active: { id: 'e1' } } as Parameters<
        typeof result.current.onDragStart
      >[0]);
      await result.current.onDragEnd({
        active: { id: 'e1' },
        over: { id: 'e2' },
      } as Parameters<typeof result.current.onDragEnd>[0]);
    });

    expect(result.current.orderedIds).toEqual(originalOrder);
    expect(notifications.error).toHaveBeenCalledWith('Failed to save run order');
  });

  it('does not re-sync orderedIds from props while isDragging is true', () => {
    const entries = [makeEntry('e1', 1), makeEntry('e2', 2)];
    const { result, rerender } = renderHook(
      ({ rawEntries }) => useRunOrderDrag({ rawEntries, classId: 'c1', isEnabled: true }),
      { initialProps: { rawEntries: entries } }
    );

    act(() => {
      result.current.onDragStart({ active: { id: 'e1' } } as Parameters<
        typeof result.current.onDragStart
      >[0]);
    });

    expect(result.current.isDragging).toBe(true);

    // New entries arrive from server while dragging
    const updatedEntries = [makeEntry('e2', 1), makeEntry('e1', 2)]; // reversed from server
    rerender({ rawEntries: updatedEntries });

    // orderedIds should NOT have changed — drag is in progress
    expect(result.current.orderedIds).toEqual(['e1', 'e2']);
  });

  it('re-syncs orderedIds when not dragging', () => {
    const entries = [makeEntry('e1', 1), makeEntry('e2', 2)];
    const { result, rerender } = renderHook(
      ({ rawEntries }) => useRunOrderDrag({ rawEntries, classId: 'c1', isEnabled: true }),
      { initialProps: { rawEntries: entries } }
    );

    // Server reorders while not dragging
    const updated = [makeEntry('e2', 1), makeEntry('e1', 2)];
    rerender({ rawEntries: updated });

    expect(result.current.orderedIds).toEqual(['e2', 'e1']);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/myk9show && npx vitest run src/components/classes/ClassResultsTable/__tests__/useRunOrderDrag
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useRunOrderDrag`**

Create `apps/myk9show/src/components/classes/ClassResultsTable/useRunOrderDrag.ts`:

```typescript
import { useState, useCallback, useEffect } from 'react';
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { notifications } from '@/lib/notifications';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

interface UseRunOrderDragParams {
  rawEntries: RawEntryRow[];
  classId: string;
  isEnabled: boolean;
}

export function useRunOrderDrag({ rawEntries, isEnabled }: UseRunOrderDragParams) {
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Initialize / re-sync from server data (skipped while mid-drag)
  useEffect(() => {
    if (isDragging) return;
    const sorted = [...rawEntries].sort((a, b) => {
      if (a.run_order == null && b.run_order == null) return 0;
      if (a.run_order == null) return 1;
      if (b.run_order == null) return -1;
      return a.run_order - b.run_order;
    });
    setOrderedIds(sorted.map(e => e.id));
  }, [rawEntries, isDragging]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragStart = useCallback((_event: DragStartEvent) => {
    setIsDragging(true);
  }, []);

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setIsDragging(false);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const snapshot = orderedIds;
      const oldIndex = snapshot.indexOf(String(active.id));
      const newIndex = snapshot.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const newIds = arrayMove(snapshot, oldIndex, newIndex);
      setOrderedIds(newIds);

      // Only update entries whose position actually changed
      const updates: Array<{ id: string; runOrder: number }> = [];
      newIds.forEach((id, idx) => {
        if (snapshot[idx] !== id) {
          updates.push({ id, runOrder: idx + 1 });
        }
      });

      try {
        await Promise.all(
          updates.map(u => replicatedEntriesTable.updateEntry(u.id, { runOrder: u.runOrder }))
        );
      } catch {
        setOrderedIds(snapshot);
        notifications.error('Failed to save run order');
      }
    },
    [orderedIds]
  );

  return { orderedIds, isDragging, sensors, onDragStart, onDragEnd, isEnabled };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/components/classes/ClassResultsTable/__tests__/useRunOrderDrag
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/useRunOrderDrag.ts \
        apps/myk9show/src/components/classes/ClassResultsTable/__tests__/useRunOrderDrag.test.ts
git commit -m "feat(run-order): add useRunOrderDrag hook with optimistic persistence and rollback"
```

---

## Task 3: Create `SortableRow` and `DragHandleCell`

**Files:**

- Create: `apps/myk9show/src/components/classes/ClassResultsTable/SortableRow.tsx`

- [ ] **Step 1: Implement `SortableRow.tsx`**

Create `apps/myk9show/src/components/classes/ClassResultsTable/SortableRow.tsx`:

```tsx
import React, { createContext, useContext } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TableRow } from '@/components/ui/table';

interface DragHandleContextValue {
  listeners: Record<string, (e: React.SyntheticEvent) => void> | undefined;
  position: number;
}

const DragHandleContext = createContext<DragHandleContextValue>({
  listeners: undefined,
  position: 0,
});

interface SortableRowProps {
  id: string;
  position: number;
  children: React.ReactNode;
}

export function SortableRow({ id, position, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <DragHandleContext.Provider value={{ listeners, position }}>
      <TableRow
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1,
        }}
        {...attributes}
      >
        {children}
      </TableRow>
    </DragHandleContext.Provider>
  );
}

// Returns content only — the DnD table wraps this in <TableCell>
export function DragHandleCell() {
  const { listeners, position } = useContext(DragHandleContext);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        role="button"
        aria-label="Drag to reorder"
        style={{
          color: '#c4c9d4',
          fontSize: 15,
          cursor: 'grab',
          userSelect: 'none',
          lineHeight: 1,
        }}
        {...listeners}
      >
        ⠿
      </span>
      <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500 }}>{position}</span>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd apps/myk9show && npx tsc --noEmit --project tsconfig.json 2>&1 | grep SortableRow
```

Expected: no errors for SortableRow.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/SortableRow.tsx
git commit -m "feat(run-order): add SortableRow and DragHandleCell components"
```

---

## Task 4: Wire drag-and-drop into `ClassResultsTable`

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`

The drag-enabled render path replaces `<DataTable>` with a manual `<Table>` using `useReactTable` from TanStack directly — this is the only way to inject `SortableRow` wrappers around each `<TableRow>` without modifying DataTable. When drag is disabled (Completed tab, closed class, exhibitor), `<DataTable>` renders as before.

- [ ] **Step 1: Add imports at top of `ClassResultsTable/index.tsx`**

Add after existing imports:

```tsx
import { DndContext, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRunOrderDrag } from './useRunOrderDrag';
import { SortableRow, DragHandleCell } from './SortableRow';
```

- [ ] **Step 2: Add `isClosed` and `showDragHandles` derived booleans**

Inside the `ClassResultsTable` component, after the existing `const canEdit = ...` line, add:

```tsx
const isClosed = classStatus === 'closed' || classStatus === 'results_released';
const showDragHandles = canEdit && !isClosed && scoringTab !== 'completed';
```

- [ ] **Step 3: Instantiate `useRunOrderDrag`**

After the existing `useClassResults(...)` call, add:

```tsx
const {
  orderedIds,
  isDragging: _isDragging,
  sensors,
  onDragStart,
  onDragEnd,
} = useRunOrderDrag({
  rawEntries: rawEntries ?? [],
  classId: classId ?? '',
  isEnabled: showDragHandles,
});
```

- [ ] **Step 4: Add `orderedFilteredRows` memo**

After the existing `filteredRows` memo, add:

```tsx
const orderedFilteredRows = useMemo(() => {
  if (!showDragHandles || orderedIds.length === 0) return filteredRows;
  const idxMap = new Map(orderedIds.map((id, i) => [id, i]));
  return [...filteredRows].sort((a, b) => {
    const ai = idxMap.get(a.entryId) ?? Infinity;
    const bi = idxMap.get(b.entryId) ?? Infinity;
    return ai - bi;
  });
}, [filteredRows, orderedIds, showDragHandles]);
```

- [ ] **Step 5: Add `dragColumns` memo and `dndTable` instance**

After the `orderedFilteredRows` memo, add these two declarations. Note: `useReactTable` must be called unconditionally at the component level (React hooks rule), so we always call it and only use it when `showDragHandles` is true.

```tsx
const dragCol: ColumnDef<ScoringRow, unknown> = useMemo(
  () => ({
    id: 'dragHandle',
    header: () => null,
    cell: () => <DragHandleCell />,
    enableSorting: false,
  }),
  []
);

const dragColumns = useMemo(
  () => (showDragHandles ? [dragCol, ...columns] : columns),
  [showDragHandles, dragCol, columns]
);

const dndTable = useReactTable({
  data: orderedFilteredRows,
  columns: dragColumns,
  getCoreRowModel: getCoreRowModel(),
  getRowId: row => row.entryId,
});
```

- [ ] **Step 6: Replace DataTable render with conditional inline JSX**

In the existing JSX, find the `<DataTable<ScoringRow>` block (inside the `effectiveViewMode === 'table'` branch). Replace it:

```tsx
// Before:
<DataTable<ScoringRow>
  tableId="classResults"
  columns={columns}
  data={filteredRows}
  getRowId={row => row.entryId}
  pageSize={9999}
/>;

// After:
{
  showDragHandles ? (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {dndTable.getHeaderGroups().map(hg => (
                <TableRow key={hg.id}>
                  {hg.headers.map(header => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {dndTable.getRowModel().rows.map((row, idx) => (
                <SortableRow key={row.id} id={row.id} position={idx + 1}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </SortableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SortableContext>
    </DndContext>
  ) : (
    <DataTable<ScoringRow>
      tableId="classResults"
      columns={columns}
      data={filteredRows}
      getRowId={row => row.entryId}
      pageSize={9999}
    />
  );
}
```

- [ ] **Step 7: Run TypeScript check**

```bash
cd apps/myk9show && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -i "ClassResultsTable\|SortableRow\|useRunOrderDrag"
```

Expected: no errors.

- [ ] **Step 8: Run existing ClassResultsTable tests**

```bash
cd apps/myk9show && npx vitest run src/components/classes/ClassResultsTable
```

Expected: all existing tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/index.tsx
git commit -m "feat(run-order): wire drag-and-drop into ClassResultsTable"
```

---

## Task 5: Drag handle visibility tests

**Files:**

- Create: `apps/myk9show/src/components/classes/ClassResultsTable/__tests__/drag-handle-visibility.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/myk9show/src/components/classes/ClassResultsTable/__tests__/drag-handle-visibility.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import render from '@/test/utils/testUtils';
import { ClassResultsTable } from '../index';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { UserPermissions } from '@/types/user-permissions';

// Mock heavy UI deps
vi.mock('@/components/common/CheckInStatusBadge', () => ({
  CheckInStatusBadge: () => <span data-testid="checkin-badge" />,
}));
vi.mock('@/components/common/StatusPickerDialog', () => ({
  StatusPickerDialog: () => null,
}));
vi.mock('@/components/common/ViewToggle', () => ({
  ViewToggle: () => <div data-testid="view-toggle" />,
}));
vi.mock('@/hooks/useVisibleResultFields', () => ({
  useVisibleResultFields: () => ({
    showPlacement: true,
    showQualification: true,
    showTime: true,
    showFaults: true,
    selfCheckinEnabled: true,
  }),
  deriveClassState: () => 'scoring',
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ isSecretary: true, isJudge: false, isExhibitor: false }),
}));
vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutate: vi.fn() }),
}));

const secretaryPerms: UserPermissions = {
  canEditEntries: true,
  canViewResults: true,
  canManageShow: true,
};

const exhibitorPerms: UserPermissions = {
  canEditEntries: false,
  canViewResults: true,
  canManageShow: false,
};

const mockConfig: ScentWorkClassConfig = {
  id: 'c1',
  name: 'Novice Container',
  element: 'Container',
  level: 'Novice',
  areas: 1,
  timeLimit: 180,
};

const mockEntries: ScentWorkEntry[] = [
  {
    id: 'e1',
    classId: 'c1',
    displayInfo: { dogName: 'Rex', handlerName: 'Jane', armband: '01', dogBreed: 'Lab' },
    registrations: [],
  } as unknown as ScentWorkEntry,
];

const mockRaw: RawEntryRow[] = [
  {
    id: 'e1',
    class_id: 'c1',
    show_id: 's1',
    dog_id: 'd1',
    handler_id: null,
    armband: '01',
    handler: 'Jane',
    result_status: null,
    is_scored: false,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: null,
    check_in_status: 'no-status',
    run_order: 1,
    dog: { id: 'd1', name: 'Rex', call_name: 'Rex', breed: 'Lab', owner: null },
    created_at: null,
    updated_at: null,
  },
];

function renderTable(
  overrides: Partial<{
    userPermissions: UserPermissions;
    classStatus: string;
    scoringTab: 'pending' | 'completed' | 'all';
  }> = {}
) {
  const { scoringTab: _tab, ...rest } = overrides;
  return render(
    <ClassResultsTable
      entries={mockEntries}
      rawEntries={mockRaw}
      classConfig={mockConfig}
      userPermissions={secretaryPerms}
      classId="c1"
      showId="s1"
      trialId="t1"
      classStatus="scoring"
      {...rest}
    />
  );
}

describe('ClassResultsTable drag handle visibility', () => {
  it('shows drag handle on Pending tab for secretary on non-closed class', () => {
    renderTable();
    // Default tab is Pending
    expect(screen.getByRole('button', { name: /drag to reorder/i })).toBeInTheDocument();
  });

  it('shows drag handle on All tab for secretary on non-closed class', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('tab', { name: /all/i }));
    expect(screen.getByRole('button', { name: /drag to reorder/i })).toBeInTheDocument();
  });

  it('hides drag handle on Completed tab', async () => {
    // Mark entry as scored
    const scoredRaw: RawEntryRow[] = [
      { ...mockRaw[0], is_scored: true, result_status: 'qualified' },
    ];
    const { user } = renderTable();
    // Re-render with scored entry not available here — just switch to Completed tab
    await user.click(screen.getByRole('tab', { name: /completed/i }));
    expect(screen.queryByRole('button', { name: /drag to reorder/i })).not.toBeInTheDocument();
    void scoredRaw; // suppress unused warning
  });

  it('hides drag handle when class is closed', () => {
    renderTable({ classStatus: 'closed' });
    expect(screen.queryByRole('button', { name: /drag to reorder/i })).not.toBeInTheDocument();
  });

  it('hides drag handle for exhibitor user', () => {
    renderTable({ userPermissions: exhibitorPerms });
    expect(screen.queryByRole('button', { name: /drag to reorder/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/myk9show && npx vitest run src/components/classes/ClassResultsTable/__tests__/drag-handle-visibility
```

Expected: FAIL — tests can't find drag handle button.

- [ ] **Step 3: Run tests to confirm they pass after Task 4**

```bash
cd apps/myk9show && npx vitest run src/components/classes/ClassResultsTable/__tests__/drag-handle-visibility
```

Expected: all 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/__tests__/drag-handle-visibility.test.tsx
git commit -m "test(run-order): add drag handle visibility tests for ClassResultsTable"
```

---

## Task 6: ShowDay Realtime subscription

The Show Day page polls every 30s. To make `scoredEntries` (and thus "dogs ahead") update faster when entries are scored, we add a Realtime subscription that invalidates the ring-progress query when any scoring change happens for the exhibitor's classes.

**Files:**

- Create: `apps/myk9show/src/hooks/useShowDayRealtime.ts`
- Modify: `apps/myk9show/src/pages/ShowDayPage.tsx`

- [ ] **Step 1: Create `useShowDayRealtime.ts`**

Create `apps/myk9show/src/hooks/useShowDayRealtime.ts`:

```typescript
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';

/**
 * Subscribes to scoring changes (is_scored updates) for the exhibitor's classes
 * and invalidates the ring-progress query so "dogs ahead" updates in near-real-time.
 */
export function useShowDayRealtime(userId: string | undefined, classIds: string[]) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || classIds.length === 0) return;

    const channel = supabase.channel(`show-day-scoring:${userId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'entries',
        },
        payload => {
          const updated = payload.new as Record<string, unknown>;
          // Only invalidate when a class we care about has a scoring change
          if (classIds.includes(updated.class_id as string)) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.showDayRingProgress(userId, classIds),
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, classIds, queryClient]);
}
```

- [ ] **Step 2: Mount `useShowDayRealtime` in `ShowDayPage.tsx`**

In `apps/myk9show/src/pages/ShowDayPage.tsx`:

Add the import near the other hook imports:

```typescript
import { useShowDayRealtime } from '@/hooks/useShowDayRealtime';
```

Find where `useShowDayData` is called and add the following after it (the hook already has `userId` and `classIds` available from show day data):

```typescript
// Real-time scoring updates — keeps "dogs ahead" counter current
useShowDayRealtime(userId, classIds);
```

You need to find where `userId` and `classIds` are available. Look for `useAuthContext` and the existing `classIds` derived from show day data. Add the hook call after those are defined.

- [ ] **Step 3: Run typecheck**

```bash
cd apps/myk9show && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -i "showDayRealtime\|ShowDayPage"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/useShowDayRealtime.ts \
        apps/myk9show/src/pages/ShowDayPage.tsx
git commit -m "feat(run-order): add ShowDay realtime subscription for scoring updates"
```

---

## Task 7: Dogs-ahead display in `ClassTimelineCard`

`ShowDayClass` already provides `myRunningOrder` (the exhibitor's run_order) and `scoredEntries` (how many entries have been scored so far). Dogs ahead = `Math.max(0, myRunningOrder - scoredEntries - 1)`.

**Files:**

- Modify: `apps/myk9show/src/components/exhibitor/ClassTimelineCard.tsx`
- Modify: `apps/myk9show/src/test/components/ClassTimelineCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Open `apps/myk9show/src/test/components/ClassTimelineCard.test.tsx`. Read the existing test structure, then add these cases:

```typescript
describe('dogs ahead display', () => {
  it('shows "2 dogs ahead" when myRunningOrder=5 and scoredEntries=2', () => {
    const cls = makeClass({ myRunningOrder: 5, scoredEntries: 2 });
    render(<ClassTimelineCard classData={cls} />);
    expect(screen.getByText('2 dogs ahead')).toBeInTheDocument();
  });

  it('shows "1 dog ahead" when myRunningOrder=5 and scoredEntries=3', () => {
    const cls = makeClass({ myRunningOrder: 5, scoredEntries: 3 });
    render(<ClassTimelineCard classData={cls} />);
    expect(screen.getByText('1 dog ahead')).toBeInTheDocument();
  });

  it('shows "You\'re next" when myRunningOrder=5 and scoredEntries=4', () => {
    const cls = makeClass({ myRunningOrder: 5, scoredEntries: 4 });
    render(<ClassTimelineCard classData={cls} />);
    expect(screen.getByText("You're next")).toBeInTheDocument();
  });

  it('hides dogs-ahead when entry is already scored', () => {
    const cls = makeClass({ myRunningOrder: 5, scoredEntries: 5, isScored: true });
    render(<ClassTimelineCard classData={cls} />);
    expect(screen.queryByText(/dogs? ahead|you're next/i)).not.toBeInTheDocument();
  });

  it('hides dogs-ahead when myRunningOrder is null', () => {
    const cls = makeClass({ myRunningOrder: null, scoredEntries: 3 });
    render(<ClassTimelineCard classData={cls} />);
    expect(screen.queryByText(/dogs? ahead|you're next/i)).not.toBeInTheDocument();
  });
});
```

Note: check the existing `makeClass` helper in the test file and add `myRunningOrder` and `isScored` fields to it if they're not already there.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/myk9show && npx vitest run src/test/components/ClassTimelineCard
```

Expected: FAIL — text not found.

- [ ] **Step 3: Add dogs-ahead display to `ClassTimelineCard.tsx`**

Read `apps/myk9show/src/components/exhibitor/ClassTimelineCard.tsx` to understand the current layout, then add the following computed value and JSX.

Add the computation near the top of the component, after destructuring `classData`:

```tsx
const dogsAhead =
  classData.myRunningOrder != null && !classData.isScored
    ? Math.max(0, classData.myRunningOrder - classData.scoredEntries - 1)
    : null;

const dogsAheadText =
  dogsAhead === null
    ? null
    : dogsAhead === 0
      ? "You're next"
      : dogsAhead === 1
        ? '1 dog ahead'
        : `${dogsAhead} dogs ahead`;
```

Add the display inside the card JSX, after the class name / time info, as a small muted line:

```tsx
{
  dogsAheadText && <p className="text-xs text-muted-foreground mt-0.5">{dogsAheadText}</p>;
}
```

Read the file first to find the right insertion point so the text appears below the class label but doesn't break the layout.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/test/components/ClassTimelineCard
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/exhibitor/ClassTimelineCard.tsx \
        apps/myk9show/src/test/components/ClassTimelineCard.test.tsx
git commit -m "feat(run-order): add dogs-ahead countdown to ClassTimelineCard"
```

---

## Task 8: Dogs-ahead display in `NextUpCard`

Same logic as Task 7, but `NextUpCard` is the hero card — display should be more prominent.

**Files:**

- Modify: `apps/myk9show/src/components/exhibitor/NextUpCard.tsx`
- Modify: `apps/myk9show/src/test/components/NextUpCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Open `apps/myk9show/src/test/components/NextUpCard.test.tsx`. Read the existing test structure, then add:

```typescript
describe('dogs ahead display', () => {
  it('shows "2 dogs ahead" when myRunningOrder=5 and scoredEntries=2', () => {
    const cls = makeClass({ myRunningOrder: 5, scoredEntries: 2 });
    render(<NextUpCard classData={cls} />);
    expect(screen.getByText('2 dogs ahead')).toBeInTheDocument();
  });

  it('shows "1 dog ahead" when myRunningOrder=5 and scoredEntries=3', () => {
    const cls = makeClass({ myRunningOrder: 5, scoredEntries: 3 });
    render(<NextUpCard classData={cls} />);
    expect(screen.getByText('1 dog ahead')).toBeInTheDocument();
  });

  it('shows "You\'re next" when myRunningOrder=5 and scoredEntries=4', () => {
    const cls = makeClass({ myRunningOrder: 5, scoredEntries: 4 });
    render(<NextUpCard classData={cls} />);
    expect(screen.getByText("You're next")).toBeInTheDocument();
  });

  it('hides dogs-ahead when entry is already scored', () => {
    const cls = makeClass({ myRunningOrder: 5, scoredEntries: 5, isScored: true });
    render(<NextUpCard classData={cls} />);
    expect(screen.queryByText(/dogs? ahead|you're next/i)).not.toBeInTheDocument();
  });

  it('hides dogs-ahead when myRunningOrder is null', () => {
    const cls = makeClass({ myRunningOrder: null, scoredEntries: 3 });
    render(<NextUpCard classData={cls} />);
    expect(screen.queryByText(/dogs? ahead|you're next/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/myk9show && npx vitest run src/test/components/NextUpCard
```

Expected: FAIL — text not found.

- [ ] **Step 3: Add dogs-ahead display to `NextUpCard.tsx`**

Read `apps/myk9show/src/components/exhibitor/NextUpCard.tsx` to understand the current layout, then add the same computation as Task 7:

```tsx
const dogsAhead =
  classData.myRunningOrder != null && !classData.isScored
    ? Math.max(0, classData.myRunningOrder - classData.scoredEntries - 1)
    : null;

const dogsAheadText =
  dogsAhead === null
    ? null
    : dogsAhead === 0
      ? "You're next"
      : dogsAhead === 1
        ? '1 dog ahead'
        : `${dogsAhead} dogs ahead`;
```

Add the display in the NextUpCard hero body. Since NextUpCard is the prominent "arm's length readability" card, use slightly larger text:

```tsx
{
  dogsAheadText && <p className="text-sm text-muted-foreground mt-1">{dogsAheadText}</p>;
}
```

Read the file first to find the right insertion point — it should appear below the class name or run info section.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/test/components/NextUpCard
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd apps/myk9show && pnpm test
```

Expected: all tests PASS. If any tests hang for more than 30 seconds, stop and report.

- [ ] **Step 6: Run typecheck**

```bash
cd apps/myk9show && npx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/exhibitor/NextUpCard.tsx \
        apps/myk9show/src/test/components/NextUpCard.test.tsx
git commit -m "feat(run-order): add dogs-ahead countdown to NextUpCard"
```

---

## Task 9: Mark todo complete

**Files:**

- Modify: `TO-DOS.md`

- [ ] **Step 1: Mark the todo done**

In `TO-DOS.md`, find the line:

```
- Drag-and-drop run order in entries table
```

Replace with:

```
- [x] **Drag-and-drop run order in entries table** — Done. Secretary drag-and-drop in ClassResultsTable (Pending + All tabs, non-closed classes). Plain muted run order number alongside drag handle. Immediate optimistic persistence with rollback. Exhibitor "dogs ahead" countdown on ClassTimelineCard and NextUpCard, updated via Realtime subscription.
```

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "chore: mark drag-and-drop run order complete in TO-DOS"
```
