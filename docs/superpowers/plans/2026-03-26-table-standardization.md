# Table Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize all 22 tables in myK9Show with sortable columns, global search, pagination, and persistent column visibility.

**Architecture:** Enhance DataTable with a `tableId` prop for localStorage-persisted column visibility and auto-generated default toolbar (search + column toggle). Migrate 11 raw HTML tables to DataTable. Add `tableId` and column toggle to 11 existing DataTable tables.

**Tech Stack:** TanStack React Table v8, React, TypeScript, Vitest, localStorage

**Spec:** `docs/superpowers/specs/2026-03-26-table-standardization-design.md`

---

## Phase 1: Infrastructure

### Task 1: useColumnVisibility Hook

**Files:**

- Create: `apps/myk9show/src/hooks/useColumnVisibility.ts`
- Test: `apps/myk9show/src/hooks/__tests__/useColumnVisibility.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/myk9show/src/hooks/__tests__/useColumnVisibility.test.ts
import { renderHook, act } from '@testing-library/react';
import { useColumnVisibility } from '../useColumnVisibility';

describe('useColumnVisibility', () => {
  beforeEach(() => localStorage.clear());

  it('returns empty object when no stored state', () => {
    const { result } = renderHook(() => useColumnVisibility('test-table'));
    expect(result.current[0]).toEqual({});
  });

  it('reads stored state from localStorage on mount', () => {
    localStorage.setItem('datatable-cols-test-table', JSON.stringify({ col1: false }));
    const { result } = renderHook(() => useColumnVisibility('test-table'));
    expect(result.current[0]).toEqual({ col1: false });
  });

  it('writes to localStorage on change', () => {
    const { result } = renderHook(() => useColumnVisibility('test-table'));
    act(() => result.current[1]({ col1: false, col2: true }));
    expect(result.current[0]).toEqual({ col1: false, col2: true });
    expect(JSON.parse(localStorage.getItem('datatable-cols-test-table')!)).toEqual({
      col1: false,
      col2: true,
    });
  });

  it('returns empty object when tableId is undefined', () => {
    const { result } = renderHook(() => useColumnVisibility(undefined));
    expect(result.current[0]).toEqual({});
  });

  it('does not persist when tableId is undefined', () => {
    const { result } = renderHook(() => useColumnVisibility(undefined));
    act(() => result.current[1]({ col1: false }));
    expect(localStorage.length).toBe(0);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('datatable-cols-test-table', 'not-json');
    const { result } = renderHook(() => useColumnVisibility('test-table'));
    expect(result.current[0]).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/myk9show && npx vitest run src/hooks/__tests__/useColumnVisibility.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

```typescript
// apps/myk9show/src/hooks/useColumnVisibility.ts
import { useState, useCallback } from 'react';
import type { VisibilityState } from '@tanstack/react-table';

const STORAGE_PREFIX = 'datatable-cols-';

function readStored(tableId: string): VisibilityState {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${tableId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as VisibilityState;
    }
    return {};
  } catch {
    return {};
  }
}

export function useColumnVisibility(
  tableId?: string
): [VisibilityState, (state: VisibilityState) => void] {
  const [visibility, setVisibilityState] = useState<VisibilityState>(() =>
    tableId ? readStored(tableId) : {}
  );

  const setVisibility = useCallback(
    (next: VisibilityState) => {
      setVisibilityState(next);
      if (tableId) {
        try {
          localStorage.setItem(`${STORAGE_PREFIX}${tableId}`, JSON.stringify(next));
        } catch {
          // localStorage full or unavailable
        }
      }
    },
    [tableId]
  );

  return [visibility, setVisibility];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/hooks/__tests__/useColumnVisibility.test.ts`
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useColumnVisibility.ts apps/myk9show/src/hooks/__tests__/useColumnVisibility.test.ts
git commit -m "feat(data-table): add useColumnVisibility hook with localStorage persistence"
```

---

### Task 2: DataTable — tableId Prop and Default Toolbar

**Files:**

- Modify: `apps/myk9show/src/components/ui/data-table/index.tsx`
- Test: `apps/myk9show/src/components/ui/data-table/__tests__/data-table-default-toolbar.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// apps/myk9show/src/components/ui/data-table/__tests__/data-table-default-toolbar.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { DataTable, type ColumnDef } from '../index';

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'value', header: 'Value' },
];

const data: TestRow[] = [
  { id: '1', name: 'Alpha', value: 10 },
  { id: '2', name: 'Beta', value: 20 },
];

describe('DataTable default toolbar', () => {
  beforeEach(() => localStorage.clear());

  it('renders search and column toggle when tableId is provided and no toolbar prop', () => {
    render(<DataTable tableId="test" columns={columns} data={data} />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
  });

  it('does not render default toolbar when tableId is absent', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  it('does not render default toolbar when custom toolbar is provided', () => {
    render(
      <DataTable
        tableId="test"
        columns={columns}
        data={data}
        toolbar={() => <div data-testid="custom-toolbar">Custom</div>}
      />
    );
    expect(screen.getByTestId('custom-toolbar')).toBeInTheDocument();
    // Default search should NOT be rendered (custom toolbar replaces it)
    // The custom toolbar may or may not include DataTableSearch — that's up to the caller
  });

  it('persists column visibility to localStorage', async () => {
    const { user } = render(<DataTable tableId="test-persist" columns={columns} data={data} />);

    // Open column toggle
    await user.click(screen.getByRole('button', { name: /toggle columns/i }));

    // Uncheck "Value" column
    const valueCheckbox = screen.getByRole('checkbox', { name: undefined });
    // Find the checkbox for the "Value" column label
    const labels = screen.getAllByText('Value');
    const toggleLabel = labels.find(el => el.closest('label'));
    if (toggleLabel) {
      await user.click(toggleLabel);
    }

    // Verify localStorage was updated
    const stored = localStorage.getItem('datatable-cols-test-persist');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.value).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/data-table-default-toolbar.test.tsx`
Expected: FAIL — `tableId` prop doesn't exist yet

- [ ] **Step 3: Modify DataTable to accept tableId and render default toolbar**

In `apps/myk9show/src/components/ui/data-table/index.tsx`:

Add import at top:

```typescript
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { DataTableToolbar } from './data-table-toolbar';
import { DataTableSearch } from './data-table-search';
import { DataTableColumnToggle } from './data-table-column-toggle';
```

Add `tableId` to the props interface:

```typescript
interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  tableId?: string; // NEW — enables persistent column visibility + default toolbar
  pageSize?: number;
  // ... rest unchanged
}
```

Add `tableId` to the destructured props:

```typescript
export function DataTable<TData>({
  columns,
  data,
  tableId, // NEW
  pageSize = 25,
  // ... rest unchanged
```

Replace the column visibility state with the persistent hook:

```typescript
// BEFORE:
const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

// AFTER:
const [columnVisibility, setColumnVisibility] = useColumnVisibility(tableId);
```

Replace `onColumnVisibilityChange: setColumnVisibility` in the table options with:

```typescript
onColumnVisibilityChange: (updater) => {
  const next = typeof updater === 'function' ? updater(columnVisibility) : updater;
  setColumnVisibility(next);
},
```

Replace the toolbar rendering line:

```typescript
// BEFORE:
{toolbar?.({ table })}

// AFTER:
{toolbar
  ? toolbar({ table })
  : tableId && (
      <DataTableToolbar table={table}>
        <DataTableSearch />
        <DataTableColumnToggle />
      </DataTableToolbar>
    )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/data-table-default-toolbar.test.tsx`
Expected: all tests PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: no new failures (existing DataTable tests still pass since `tableId` is optional)

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/ui/data-table/index.tsx apps/myk9show/src/components/ui/data-table/__tests__/data-table-default-toolbar.test.tsx
git commit -m "feat(data-table): add tableId prop for persistent column visibility and default toolbar"
```

---

## Phase 2: Tier 1 — Simple Table Migrations

### Task 3: TrialsTab Table View

**Files:**

- Modify: `apps/myk9show/src/components/shows/tabs/TrialsTab.tsx`
- Test: `apps/myk9show/src/components/shows/tabs/__tests__/TrialsTab.table.test.tsx`

**Context:** TrialsTab has a card/table view toggle. Only the table view branch (lines 217-287) is replaced with DataTable. Card view is unchanged. The `filteredTrials` array and `trialStats` map must be merged into a flat row type for DataTable accessors.

- [ ] **Step 1: Write failing test**

```typescript
// apps/myk9show/src/components/shows/tabs/__tests__/TrialsTab.table.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { TrialsTab } from '../TrialsTab';
import type { Trial } from '@/components/trials/types/trial.types';

const mockTrials: Trial[] = [
  {
    id: 't1',
    showId: 's1',
    showName: 'Test Show',
    trialDate: '2026-05-09',
    trialNumber: '1',
    status: 'upcoming',
    name: 'Saturday Trial 1',
    trialType: 'Scent Work',
    plannedStartTime: '8:00 AM',
  },
  {
    id: 't2',
    showId: 's1',
    showName: 'Test Show',
    trialDate: '2026-05-09',
    trialNumber: '2',
    status: 'upcoming',
    name: 'Saturday Trial 2',
    trialType: 'Scent Work',
    plannedStartTime: '12:00 PM',
  },
];

const mockStats = {
  t1: { classCount: 6, entryCount: 12, completedClasses: 0 },
  t2: { classCount: 10, entryCount: 25, completedClasses: 3 },
};

// Must switch to table view since TrialsTab defaults to 'cards'
async function renderInTableView() {
  const result = render(
    <TrialsTab trials={mockTrials} showId="s1" trialStats={mockStats} />
  );
  // Click the table view toggle
  const tableToggle = screen.getByRole('button', { name: /table/i });
  await result.user.click(tableToggle);
  return result;
}

describe('TrialsTab table view', () => {
  it('renders sortable column headers', async () => {
    await renderInTableView();
    // DataTable renders sort buttons for sortable columns
    expect(screen.getByRole('button', { name: /date/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trial name/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /status/i })).toBeInTheDocument();
  });

  it('renders data rows', async () => {
    await renderInTableView();
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Saturday Trial 2')).toBeInTheDocument();
  });

  it('renders search input', async () => {
    await renderInTableView();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('filters rows on search', async () => {
    const { user } = await renderInTableView();
    await user.type(screen.getByPlaceholderText(/search/i), 'Trial 1');
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
    expect(screen.queryByText('Saturday Trial 2')).not.toBeInTheDocument();
  });

  it('renders column visibility toggle', async () => {
    await renderInTableView();
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/myk9show && npx vitest run src/components/shows/tabs/__tests__/TrialsTab.table.test.tsx`
Expected: FAIL — no sortable column headers in current HTML table

- [ ] **Step 3: Migrate TrialsTab table view to DataTable**

In `apps/myk9show/src/components/shows/tabs/TrialsTab.tsx`:

Add imports:

```typescript
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
```

Define the flat row type and columns outside the component:

```typescript
interface TrialRow {
  id: string;
  trialDate: string;
  name: string;
  trialNumber: string;
  trialType?: string;
  plannedStartTime?: string;
  status: ClassStatusValue;
  classCount: number;
  entryCount: number;
  completedClasses: number;
}

const trialColumns: ColumnDef<TrialRow, unknown>[] = [
  {
    accessorKey: 'trialDate',
    header: 'Date',
    sortingFn: 'datetime',
    cell: ({ row }) => {
      const parts = getDateParts(row.original.trialDate);
      return parts ? `${parts.month} ${parts.day}` : '\u2014';
    },
  },
  {
    accessorKey: 'name',
    header: 'Trial Name',
  },
  {
    accessorKey: 'trialType',
    header: 'Type',
    meta: { responsiveHide: 'md' as const },
  },
  {
    accessorKey: 'plannedStartTime',
    header: 'Time',
    meta: { responsiveHide: 'md' as const },
  },
  {
    accessorKey: 'classCount',
    header: 'Classes',
  },
  {
    accessorKey: 'entryCount',
    header: 'Entries',
  },
  {
    accessorKey: 'completedClasses',
    header: 'Scored',
    meta: { responsiveHide: 'sm' as const },
    cell: ({ row }) => {
      const { completedClasses, classCount } = row.original;
      return completedClasses > 0 ? `${completedClasses}/${classCount}` : '\u2014';
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge className={`text-[10px] ${getClassStatusBadgeClasses(row.original.status)}`}>
        {getClassStatusDisplay(row.original.status).label}
      </Badge>
    ),
  },
];
```

Inside the component, add a `useMemo` to merge trial data with stats:

```typescript
const tableData = useMemo<TrialRow[]>(
  () =>
    filteredTrials.map(trial => ({
      id: trial.id,
      trialDate: trial.trialDate,
      name: trial.name || `Trial ${trial.trialNumber}`,
      trialNumber: trial.trialNumber,
      trialType: trial.trialType,
      plannedStartTime: trial.plannedStartTime,
      status: trial.status,
      ...(trialStats[trial.id] || EMPTY_STATS),
    })),
  [filteredTrials, trialStats]
);
```

Replace the table view branch (the `<div className="rounded-xl...">` containing the raw `<table>`) with:

```tsx
<DataTable
  tableId="trialsTab"
  columns={trialColumns}
  data={tableData}
  onRowClick={row => navigate(`/shows/${showId}/trials/${row.id}`)}
/>
```

Remove unused imports: `ChevronRight` (if only used in table view).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/shows/tabs/__tests__/TrialsTab.table.test.tsx`
Expected: all tests PASS

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/shows/tabs/TrialsTab.tsx apps/myk9show/src/components/shows/tabs/__tests__/TrialsTab.table.test.tsx
git commit -m "feat(trials-tab): migrate table view to DataTable with search, sort, and column toggle"
```

---

### Task 4: EntriesTab (ShowDetails)

**Files:**

- Modify: `apps/myk9show/src/components/shows/ShowDetails/EntriesTab.tsx`
- Test: `apps/myk9show/src/components/shows/ShowDetails/__tests__/EntriesTab.table.test.tsx`

**Context:** This component has its own React Query data fetching, a manual search input, and renders a raw HTML table. Replace the manual search with DataTable's built-in global filter. The manual search input, `searchTerm` state, and `filteredEntries` useMemo are all removed.

- [ ] **Step 1: Write failing test**

```typescript
// apps/myk9show/src/components/shows/ShowDetails/__tests__/EntriesTab.table.test.tsx
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { EntriesTab } from '../EntriesTab';

// Mock getEntriesByShow to return test data
vi.mock('@/services/database/queries/entryQueries', () => ({
  getEntriesByShow: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'e1',
        entry_status: 'submitted',
        handler: 'Jim Sills',
        armband: '103',
        entry_fee: 30,
        payment_status: 'paid',
        created_at: '2026-03-24T10:00:00Z',
        dog: {
          id: 'd1',
          name: 'Maximus',
          call_name: 'Max',
          breed: 'Dutch Shepherd',
          owner: { id: 'p1', first_name: 'Jim', last_name: 'Sills', email: 'jim@test.com' },
        },
        class: { id: 'c1', name: 'Detective', class_number: 1, entry_fee: 30 },
      },
      {
        id: 'e2',
        entry_status: 'submitted',
        handler: 'Richard Beezley',
        armband: '101',
        entry_fee: 30,
        payment_status: 'paid',
        created_at: '2026-03-24T11:00:00Z',
        dog: {
          id: 'd2',
          name: 'Tera',
          call_name: null,
          breed: 'Akita',
          owner: { id: 'p2', first_name: 'Richard', last_name: 'Beezley', email: 'r@test.com' },
        },
        class: { id: 'c1', name: 'Detective', class_number: 1, entry_fee: 30 },
      },
    ],
    error: null,
  }),
}));

describe('EntriesTab table', () => {
  it('renders sortable column headers', async () => {
    render(<EntriesTab showId="s1" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /dog/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /class/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /status/i })).toBeInTheDocument();
  });

  it('renders search input', async () => {
    render(<EntriesTab showId="s1" />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  it('renders data rows', async () => {
    render(<EntriesTab showId="s1" />);
    await waitFor(() => {
      expect(screen.getByText('Maximus')).toBeInTheDocument();
    });
    expect(screen.getByText('Tera')).toBeInTheDocument();
  });

  it('filters rows on search', async () => {
    const { user } = render(<EntriesTab showId="s1" />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/search/i), 'Maximus');
    await waitFor(() => {
      expect(screen.getByText('Maximus')).toBeInTheDocument();
      expect(screen.queryByText('Tera')).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/myk9show && npx vitest run src/components/shows/ShowDetails/__tests__/EntriesTab.table.test.tsx`
Expected: FAIL

- [ ] **Step 3: Migrate EntriesTab to DataTable**

Replace the manual search, Card wrapper, and raw HTML table with DataTable. Define column definitions for Dog (name + breed subtitle), Class, Handler/Owner, Armband (monospace), Status (badge), Date.

Remove: `searchTerm` state, `filteredEntries` useMemo, the manual search `<input>`, the raw `<table>`, the "no results" div after the table.

The data from React Query (`entries`) is passed directly to DataTable — no transformation needed since cell renderers access `row.original` for nested fields.

Key column definitions:

```typescript
const entryColumns: ColumnDef<ShowEntryRow, unknown>[] = [
  {
    id: 'dogName',
    accessorFn: (row) => row.dog?.call_name || row.dog?.name || 'Unknown Dog',
    header: 'Dog',
    cell: ({ row }) => {
      const dog = row.original.dog;
      const name = dog?.call_name || dog?.name || 'Unknown Dog';
      const breed = dog?.breed || '';
      return (
        <div>
          <div className="font-medium text-foreground">{name}</div>
          {breed && <div className="text-xs text-muted-foreground">{breed}</div>}
        </div>
      );
    },
  },
  {
    id: 'className',
    accessorFn: (row) => row.class?.name || 'N/A',
    header: 'Class',
  },
  {
    id: 'handler',
    accessorFn: (row) =>
      row.handler ||
      (row.dog?.owner
        ? `${row.dog.owner.first_name || ''} ${row.dog.owner.last_name || ''}`.trim()
        : 'N/A'),
    header: 'Handler / Owner',
    meta: { responsiveHide: 'md' as const },
  },
  {
    accessorKey: 'armband',
    header: 'Armband',
    cell: ({ getValue }) => (
      <span className="font-mono">{(getValue() as string) || '-'}</span>
    ),
  },
  {
    accessorKey: 'entry_status',
    header: 'Status',
    cell: ({ getValue }) => {
      const status = (getValue() as string) || 'Unknown';
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getEntryStatusClasses(status)}`}
        >
          {status}
        </span>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Date',
    sortingFn: 'datetime',
    meta: { responsiveHide: 'sm' as const },
    cell: ({ getValue }) => formatDate(getValue() as string | null),
  },
];
```

Replace the table rendering with:

```tsx
<DataTable
  tableId="showEntriesTab"
  columns={entryColumns}
  data={entries}
  emptyState={/* existing empty state JSX */}
/>
```

Keep the "Manage Entries" button above the DataTable (outside it), along with the entry count display.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/shows/ShowDetails/__tests__/EntriesTab.table.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/ShowDetails/EntriesTab.tsx apps/myk9show/src/components/shows/ShowDetails/__tests__/EntriesTab.table.test.tsx
git commit -m "feat(entries-tab): migrate to DataTable with search, sort, and column toggle"
```

---

### Task 5: MyEntriesTab Table View

**Files:**

- Modify: `apps/myk9show/src/components/shows/tabs/MyEntriesTab.tsx`
- Test: `apps/myk9show/src/components/shows/tabs/__tests__/MyEntriesTab.table.test.tsx`

**Context:** MyEntriesTab has card/table toggle. Replace only the table view branch. Data comes from `useMyEntries(showId)` hook returning `entriesByClass` array with shape: `{ classId, className, scored, dogsAhead, dogName, armband }`.

- [ ] **Step 1: Write failing test**

```typescript
// apps/myk9show/src/components/shows/tabs/__tests__/MyEntriesTab.table.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { MyEntriesTab } from '../MyEntriesTab';

vi.mock('@/hooks/useMyEntries', () => ({
  useMyEntries: () => ({
    entriesByClass: [
      {
        classId: 'c1',
        className: 'Detective Novice',
        scored: false,
        dogsAhead: 3,
        dogName: 'Tera',
        armband: '101',
      },
      {
        classId: 'c2',
        className: 'Handler Discrimination',
        scored: true,
        dogsAhead: 0,
        dogName: 'Tera',
        armband: '101',
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));

async function renderInTableView() {
  const result = render(<MyEntriesTab showId="s1" />);
  const tableToggle = screen.getByRole('button', { name: /table/i });
  await result.user.click(tableToggle);
  return result;
}

describe('MyEntriesTab table view', () => {
  it('renders sortable column headers', async () => {
    await renderInTableView();
    expect(screen.getByRole('button', { name: /class/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /status/i })).toBeInTheDocument();
  });

  it('renders data rows', async () => {
    await renderInTableView();
    expect(screen.getByText('Detective Novice')).toBeInTheDocument();
    expect(screen.getByText('Handler Discrimination')).toBeInTheDocument();
  });

  it('renders search input', async () => {
    await renderInTableView();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/myk9show && npx vitest run src/components/shows/tabs/__tests__/MyEntriesTab.table.test.tsx`
Expected: FAIL

- [ ] **Step 3: Migrate MyEntriesTab table view to DataTable**

Define columns: Class, Status (Scored/Pending badge), Progress, My Dog (name + armband), Position ("Next up" / "N ahead" / "Completed"). Replace raw `<table>` branch with:

```tsx
<DataTable
  tableId="myEntriesTab"
  columns={myEntryColumns}
  data={entriesByClass}
  getRowId={row => row.classId}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/shows/tabs/__tests__/MyEntriesTab.table.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/tabs/MyEntriesTab.tsx apps/myk9show/src/components/shows/tabs/__tests__/MyEntriesTab.table.test.tsx
git commit -m "feat(my-entries-tab): migrate table view to DataTable with search, sort, and column toggle"
```

---

### Task 6: ScratchEntriesTable

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/DayOfOperationsPage/ScratchEntriesTable.tsx`
- Test: `apps/myk9show/src/pages/secretary/DayOfOperationsPage/__tests__/ScratchEntriesTable.test.tsx`

**Context:** Simple table with action column (Scratch button). Action column has `enableSorting: false` and `enableHiding: false`.

- [ ] **Step 1: Write failing test**

Test renders with mock `ScratchableEntry[]` data, asserts sortable headers (Armband, Dog, Handler, Class, Check-in), search input, and that clicking the Scratch button calls `onScratch`. The Actions column header should NOT be a sort button.

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/DayOfOperationsPage/__tests__/ScratchEntriesTable.test.tsx`
Expected: FAIL

- [ ] **Step 3: Migrate to DataTable**

Define columns with `enableSorting: false` and `enableHiding: false` on the Actions column. Pass `onScratch` callback through cell renderer. Replace raw `<table>` with:

```tsx
<DataTable tableId="scratchEntries" columns={scratchColumns} data={entries} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/DayOfOperationsPage/__tests__/ScratchEntriesTable.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/DayOfOperationsPage/ScratchEntriesTable.tsx apps/myk9show/src/pages/secretary/DayOfOperationsPage/__tests__/ScratchEntriesTable.test.tsx
git commit -m "feat(scratch-entries): migrate to DataTable with search, sort, and column toggle"
```

---

### Task 7: MoveUpEntriesTable

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/DayOfOperationsPage/MoveUpEntriesTable.tsx`
- Test: `apps/myk9show/src/pages/secretary/DayOfOperationsPage/__tests__/MoveUpEntriesTable.test.tsx`

**Context:** Nearly identical pattern to ScratchEntriesTable. Columns: Armband, Dog, Handler, Current Class, Status (badge), Actions (Move Up button with `enableSorting: false`, `enableHiding: false`).

- [ ] **Step 1: Write failing test**

Same pattern as Task 6: mock data, assert sortable headers, search input, Move Up button calls `onMoveUp`.

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/DayOfOperationsPage/__tests__/MoveUpEntriesTable.test.tsx`
Expected: FAIL

- [ ] **Step 3: Migrate to DataTable**

```tsx
<DataTable tableId="moveUpEntries" columns={moveUpColumns} data={entries} />
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/DayOfOperationsPage/MoveUpEntriesTable.tsx apps/myk9show/src/pages/secretary/DayOfOperationsPage/__tests__/MoveUpEntriesTable.test.tsx
git commit -m "feat(move-up-entries): migrate to DataTable with search, sort, and column toggle"
```

---

### Task 8: ClassAvailabilityTable

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/DayOfOperationsPage/ClassAvailabilityTable.tsx`
- Test: `apps/myk9show/src/pages/secretary/DayOfOperationsPage/__tests__/ClassAvailabilityTable.test.tsx`

**Context:** Columns: Class (number prefix + name), Limit, Accepted, Available, Status (Open/Full badge). No action column. Small dataset (typically 6-10 rows).

- [ ] **Step 1: Write failing test**

Mock `ClassWithCapacity[]` data, assert sortable headers, search input, status badges.

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/DayOfOperationsPage/__tests__/ClassAvailabilityTable.test.tsx`
Expected: FAIL

- [ ] **Step 3: Migrate to DataTable**

```tsx
<DataTable tableId="classAvailability" columns={classAvailColumns} data={classes} />
```

Keep the "Add Day-of Entry" button above the DataTable (outside it).

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/DayOfOperationsPage/ClassAvailabilityTable.tsx apps/myk9show/src/pages/secretary/DayOfOperationsPage/__tests__/ClassAvailabilityTable.test.tsx
git commit -m "feat(class-availability): migrate to DataTable with search, sort, and column toggle"
```

---

## Phase 3: Tier 2 — Medium Migrations

### Task 9: ClassesTab Table View

**Files:**

- Modify: `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx`
- Test: `apps/myk9show/src/components/shows/tabs/__tests__/ClassesTab.table.test.tsx`

**Context:** This is the most involved Tier 2 migration. Currently groups classes by trial with section header rows. The migration flattens this: trial info becomes a "Trial" column so all rows are sortable/searchable. The Mine toggle, status filter, and card/table view toggle remain above the DataTable.

Key changes:

1. Remove `groupedByTrial` useMemo (no longer needed for table view; keep for card view)
2. Add `trialLabel` to each class row: `formatTrialDate(cls.trialDate) + ' — ' + cls.trialName`
3. Define column with custom `compareLevels` sort function for the Level column
4. Ring column is conditionally included based on `hideRing` prop — use `columnVisibility` to hide it by default when `hideRing` is true

- [ ] **Step 1: Write failing test**

```typescript
// apps/myk9show/src/components/shows/tabs/__tests__/ClassesTab.table.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { ClassesTab } from '../ClassesTab';

const mockClasses = [
  {
    id: 'c1',
    name: 'Detective Novice',
    element: 'Detective',
    level: 'Novice',
    section: '',
    judgeName: 'Richard Beezley',
    trialId: 't1',
    time: '8:00 AM',
    ring: 1,
    status: 'upcoming' as const,
    entryCount: 4,
    userHasEntry: true,
    trialDate: '2026-05-09',
    trialNumber: '1',
    trialName: 'Saturday Trial 1',
  },
  {
    id: 'c2',
    name: 'Handler Discrimination Novice',
    element: 'Handler Discrimination',
    level: 'Novice',
    section: '',
    judgeName: 'Richard Beezley',
    trialId: 't1',
    time: '9:00 AM',
    ring: 1,
    status: 'upcoming' as const,
    entryCount: 6,
    userHasEntry: false,
    trialDate: '2026-05-09',
    trialNumber: '1',
    trialName: 'Saturday Trial 1',
  },
];

describe('ClassesTab table view', () => {
  it('renders sortable column headers including Trial', async () => {
    const { user } = render(
      <ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />
    );
    // ClassesTab defaults to 'table' view — no toggle needed
    expect(screen.getByRole('button', { name: /trial/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /element/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /level/i })).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('filters rows on search', async () => {
    const { user } = render(
      <ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />
    );
    await user.type(screen.getByPlaceholderText(/search/i), 'Detective');
    expect(screen.getByText('Detective')).toBeInTheDocument();
    expect(screen.queryByText('Handler Discrimination')).not.toBeInTheDocument();
  });

  it('renders column visibility toggle', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />);
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/myk9show && npx vitest run src/components/shows/tabs/__tests__/ClassesTab.table.test.tsx`
Expected: FAIL

- [ ] **Step 3: Migrate ClassesTab table view to DataTable**

Add a `trialLabel` computed field to each class:

```typescript
const tableData = useMemo(
  () =>
    filteredClasses.map(cls => ({
      ...cls,
      trialLabel: [
        cls.trialDate ? formatTrialDate(cls.trialDate) : '',
        cls.trialName || (cls.trialNumber ? `Trial ${cls.trialNumber}` : ''),
      ]
        .filter(Boolean)
        .join(' \u2014 '),
    })),
  [filteredClasses]
);
```

Define columns with Trial, Element, Level (custom sort using `compareLevels`), Judge, Time, Ring (conditionally via meta or initial visibility), Status, Entries.

Level column sort function:

```typescript
{
  accessorKey: 'level',
  header: 'Level',
  sortingFn: (rowA, rowB) =>
    compareLevels(rowA.original.level, rowB.original.level),
  cell: ({ row }) => {
    const cls = row.original;
    return (
      <>
        {cls.level}
        {shouldShowSection(cls) && (
          <span className="ml-1 text-muted-foreground">{cls.section}</span>
        )}
      </>
    );
  },
},
```

Replace the table view branch with:

```tsx
<DataTable
  tableId="classesTab"
  columns={classColumns}
  data={tableData}
  onRowClick={cls => navigate(`/shows/${showId}/trials/${cls.trialId}/classes/${cls.id}`)}
/>
```

Keep card view branch unchanged (still uses `groupedByTrial`). The `groupedByTrial` useMemo remains for card view rendering.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/shows/tabs/__tests__/ClassesTab.table.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/tabs/ClassesTab.tsx apps/myk9show/src/components/shows/tabs/__tests__/ClassesTab.table.test.tsx
git commit -m "feat(classes-tab): migrate table view to DataTable, flatten trial grouping into sortable column"
```

---

### Task 10: WaitlistTable

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/WaitlistManagementPage/WaitlistTable.tsx`
- Test: `apps/myk9show/src/pages/secretary/WaitlistManagementPage/__tests__/WaitlistTable.test.tsx`

**Context:** Currently renders a card-based list, not an HTML table. Migrate to DataTable with columns: Position (numbered badge), Dog (icon + name/call_name), Added (relative timestamp), Actions (Offer Spot + Remove buttons).

Read the current file to understand the `WaitlistEntry` type and callback props (`onOfferSpot`, `onRemove`). Preserve all callback behavior in the Actions column cell renderer.

- [ ] **Step 1: Write failing test**

Test with mock waitlist entries. Assert sortable headers (Position, Dog, Added), search input, action buttons present.

- [ ] **Step 2: Run test to verify failure**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/WaitlistManagementPage/__tests__/WaitlistTable.test.tsx`
Expected: FAIL

- [ ] **Step 3: Migrate to DataTable**

Replace the card-based list with DataTable. Actions column: `enableSorting: false`, `enableHiding: false`.

```tsx
<DataTable tableId="waitlist" columns={waitlistColumns} data={entries} />
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/WaitlistManagementPage/WaitlistTable.tsx apps/myk9show/src/pages/secretary/WaitlistManagementPage/__tests__/WaitlistTable.test.tsx
git commit -m "feat(waitlist-table): migrate card list to DataTable with search, sort, and column toggle"
```

---

## Phase 4: Tier 3 — Complex Migrations

### Task 11: PermissionAuditPage Table

**Files:**

- Modify: `apps/myk9show/src/pages/admin/permissions/PermissionAuditPage.tsx`
- Test: `apps/myk9show/src/pages/admin/permissions/__tests__/PermissionAuditPage.table.test.tsx`

**Context:** This is a 563-line file with date-grouped rows, action filter dropdown, date range selector, CSV export, and 4 summary stat cards. The migration:

1. Removes date grouping — rows become a flat list (Time column already exists for sorting)
2. Keeps date range selector + action filter as custom toolbar extras
3. Keeps CSV export button in toolbar
4. Keeps stat cards above the table
5. Summary stat cards remain unchanged

Use a custom `toolbar` prop since this table has extra controls:

```tsx
toolbar={({ table }) => (
  <DataTableToolbar table={table}>
    <DataTableSearch placeholder="Search audit logs..." />
    {/* date range selector */}
    {/* action filter dropdown */}
    <DataTableColumnToggle />
    {/* CSV export button */}
  </DataTableToolbar>
)}
```

- [ ] **Step 1: Write failing test**

Test with mock audit log entries. Assert sortable headers (Action, Actor, Target, Details, Time), search input, that date range and action filter controls still render.

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Migrate table to DataTable**

Define columns: Action (icon + colored badge), Actor, Target (type + ID), Details (key:value metadata, responsive hide lg), Time (datetime sort, formatted).

Flatten the date-grouped rendering. Remove the `groupedByDate` logic for table rendering. Data is passed directly as flat array.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors (this is a large file change — typecheck is important)

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/admin/permissions/PermissionAuditPage.tsx apps/myk9show/src/pages/admin/permissions/__tests__/PermissionAuditPage.table.test.tsx
git commit -m "feat(permission-audit): migrate to DataTable, flatten date groups into sortable columns"
```

---

### Task 12: UserRoleManagementPage Table

**Files:**

- Modify: `apps/myk9show/src/pages/admin/permissions/UserRoleManagementPage.tsx`
- Test: `apps/myk9show/src/pages/admin/permissions/__tests__/UserRoleManagementPage.table.test.tsx`

**Context:** 478-line file with two tabs: "User Assignments" (table) + "Role Summary" (card grid). Only migrate the table tab. Keep the tab structure, summary cards, Assign Role button, and revoke action dropdown.

Replace the existing manual search input + raw HTML table with DataTable. The manual search state and filter logic are removed — DataTable handles it.

- [ ] **Step 1: Write failing test**

Test with mock user role data. Assert sortable headers (User, Role, Scope, Status, Assigned, Expires), search input, revoke action in dropdown.

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Migrate table tab to DataTable**

Columns: User (email + monospace user ID), Role (display_name + code), Scope (badge), Status (Active/Inactive badge), Assigned (date + assigned_by, responsive hide sm), Expires (date or "Never" badge, responsive hide lg), Actions (dropdown with Revoke, `enableSorting: false`, `enableHiding: false`).

Use custom toolbar to include DataTableSearch + DataTableColumnToggle + Assign Role button.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Run typecheck**

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/admin/permissions/UserRoleManagementPage.tsx apps/myk9show/src/pages/admin/permissions/__tests__/UserRoleManagementPage.table.test.tsx
git commit -m "feat(user-role-mgmt): migrate assignments table to DataTable with search, sort, and column toggle"
```

---

### Task 13: UserActivityUsersTab

**Files:**

- Modify: `apps/myk9show/src/components/analytics/UserActivityUsersTab.tsx`
- Test: `apps/myk9show/src/components/analytics/__tests__/UserActivityUsersTab.table.test.tsx`

**Context:** Currently a card grid, not a table. Convert to DataTable with: User (avatar + name), Role, Status (Online/Offline badge), Device (icon), Last Activity (minutes ago). Keep the engagement metrics section (progress bars) separate — do not put metrics inside the DataTable.

- [ ] **Step 1: Write failing test**

Test with mock `UserSession[]` data. Assert sortable headers, search input, online/offline badges.

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Migrate card grid to DataTable**

Columns: User (avatar + name), Role, Status (Online/Offline badge with Wifi icon), Device (icon for mobile/tablet/desktop, responsive hide sm), Last Activity (datetime sort, "X min ago" display).

```tsx
<DataTable tableId="userActivity" columns={userActivityColumns} data={sessions} />
```

Keep engagement metrics (progress bars section) below or beside the DataTable.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/analytics/UserActivityUsersTab.tsx apps/myk9show/src/components/analytics/__tests__/UserActivityUsersTab.table.test.tsx
git commit -m "feat(user-activity): migrate card grid to DataTable with search, sort, and column toggle"
```

---

## Phase 5: Tier 4 — Existing DataTable Updates

### Task 14: Add tableId and Column Toggle to Existing DataTable Tables

**Files to modify (11 total):**

**Group A — No custom toolbar (will get default toolbar automatically with just `tableId`):**

- `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx` → add `tableId="classResults"`
- `apps/myk9show/src/components/entries/management/EntriesTableView.tsx` → add `tableId="entriesManagement"`
- `apps/myk9show/src/components/admin/users/UserTable/index.tsx` → add `tableId="adminUsers"`
- `apps/myk9show/src/components/users/browse/PeopleTableView.tsx` → add `tableId="peopleBrowse"`
- `apps/myk9show/src/components/shows/browse/ShowsTableView.tsx` → add `tableId="showsBrowse"`
- `apps/myk9show/src/components/classes/ClassesTableView.tsx` → add `tableId="classesBrowse"`
- `apps/myk9show/src/components/dogs/browse/DogsTableView.tsx` → add `tableId="dogsBrowse"`

**Important:** Some of these tables may have external search inputs or `globalFilter`/`onGlobalFilterChange` props. Read each file first. If external search exists, either:
(a) Remove the external search and let the default toolbar handle it, OR
(b) Add a custom toolbar with `DataTableSearch` + `DataTableColumnToggle` and remove the external search state.

**Group B — Has custom toolbar (add `DataTableColumnToggle` to existing toolbar):**

- `apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx` → add `tableId="trialEntries"` + add `DataTableColumnToggle` to existing toolbar
- `apps/myk9show/src/components/classes/ClassEntriesTable/ClassEntriesTable.tsx` → add `tableId="classEntries"` + add `DataTableColumnToggle` to existing toolbar
- `apps/myk9show/src/components/templates/admin/ClassDefinitionTable.tsx` → add `tableId="classDefinitions"` + add `DataTableColumnToggle` to existing toolbar (when not readOnly)

**Group C — Uses external search (needs toolbar migration):**

- `apps/myk9show/src/components/trials/TrialDetail/TrialClassesTable.tsx` → add `tableId="trialClasses"` + add custom toolbar with `DataTableSearch` + `DataTableColumnToggle`, remove external `globalFilter`/`onGlobalFilterChange` props and the external search `<Input>`

- [ ] **Step 1: Update Group A tables (7 files)**

For each file, add `tableId="xxx"` prop to the `<DataTable>` component. If the file uses external search state (`globalFilter`, `onGlobalFilterChange`, or a separate search `<Input>`), remove that and let the default toolbar handle search.

Read each file first to check for external search patterns before modifying.

- [ ] **Step 2: Update Group B tables (3 files)**

For each file, add `tableId="xxx"` prop and add `<DataTableColumnToggle />` inside the existing `<DataTableToolbar>` children:

```tsx
// Example for TrialEntriesTable — add DataTableColumnToggle after DataTableSearch:
toolbar={({ table }) => (
  <DataTableToolbar table={table}>
    <DataTableSearch placeholder="Search entries..." />
    <DataTableColumnToggle />
  </DataTableToolbar>
)}
```

Import `DataTableColumnToggle` from `@/components/ui/data-table`.

- [ ] **Step 3: Update Group C table (TrialClassesTable)**

This table uses `globalFilter` + `onGlobalFilterChange` props with an external `<Input>` for search. Migrate to a custom toolbar:

1. Remove the external search `<Input>`, `searchValue` state, and `globalFilter`/`onGlobalFilterChange` props from the DataTable call
2. Add a custom `toolbar` prop with `DataTableSearch` + `DataTableColumnToggle`
3. Add `tableId="trialClasses"`

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 5: Run full test suite**

Run: `cd apps/myk9show && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: no new failures

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx \
  apps/myk9show/src/components/trials/TrialDetail/TrialClassesTable.tsx \
  apps/myk9show/src/components/classes/ClassEntriesTable/ClassEntriesTable.tsx \
  apps/myk9show/src/components/classes/ClassResultsTable/index.tsx \
  apps/myk9show/src/components/entries/management/EntriesTableView.tsx \
  apps/myk9show/src/components/admin/users/UserTable/index.tsx \
  apps/myk9show/src/components/users/browse/PeopleTableView.tsx \
  apps/myk9show/src/components/shows/browse/ShowsTableView.tsx \
  apps/myk9show/src/components/classes/ClassesTableView.tsx \
  apps/myk9show/src/components/dogs/browse/DogsTableView.tsx \
  apps/myk9show/src/components/templates/admin/ClassDefinitionTable.tsx
git commit -m "feat(data-table): add tableId and column toggle to all existing DataTable tables"
```

---

## Phase 6: Final Verification

### Task 15: Full Build and Test Verification

- [ ] **Step 1: Run typecheck across monorepo**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 3: Run full myK9Show test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: all tests pass, 0 failures

- [ ] **Step 4: Run dev server and manually verify key tables**

Run: `pnpm dev:show`

Spot-check in browser:

- Show detail → Trials tab (table view): search, sort, column toggle, pagination
- Show detail → Classes tab (table view): search, sort, Trial column, column toggle
- Show detail → Entries tab: search, sort, column toggle
- Trial detail → Entries table: column toggle present
- Trial detail → Classes table: column toggle present

- [ ] **Step 5: Final commit if any cleanup needed**

Only if steps 1-3 reveal issues that need fixing.
