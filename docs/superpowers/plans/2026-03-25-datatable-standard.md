# DataTable Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 12 ad-hoc table implementations with a single `DataTable<TData>` component built on TanStack Table + shadcn `Table` primitives.

**Architecture:** Headless TanStack Table handles logic (sorting, pagination, filtering, selection, column visibility). Our `DataTable` component renders through existing shadcn `Table/TableRow/TableHead/TableCell` primitives. Composable toolbar, inline editing, and scoring mode are layered on top. Domain hooks (e.g., `useClassResults`) stay external — DataTable is a pure UI component.

**Tech Stack:** `@tanstack/react-table`, existing shadcn `Table` primitives, Tailwind CSS, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-25-datatable-standard-design.md`

---

## File Structure

### New files to create

```
src/components/ui/data-table/
  index.tsx                      — main DataTable<TData> component
  data-table-toolbar.tsx         — composable toolbar container
  data-table-search.tsx          — global search input
  data-table-filter.tsx          — column filter dropdown
  data-table-column-toggle.tsx   — column visibility dropdown
  data-table-column-header.tsx   — sortable column header with indicators
  data-table-pagination.tsx      — pagination controls
  data-table-editable-cell.tsx   — inline editable cell wrapper
  data-table-scoring-mode.tsx    — scoring mode overlay/config
  data-table-time-input.tsx      — smart time digit-stream input
  sorting.ts                     — custom sort functions (levelProgressionSort)
  types.ts                       — shared types (DataTableMeta, EditComponentProps, etc.)

src/components/ui/data-table/__tests__/
  data-table.test.tsx            — core rendering, sorting, pagination
  data-table-search.test.tsx     — global search/filter
  data-table-selection.test.tsx  — row selection
  data-table-column-toggle.test.tsx — column visibility
  data-table-editable-cell.test.tsx — inline editing
  data-table-time-input.test.tsx — time formatting
  data-table-scoring-mode.test.tsx — scoring mode (auto-advance, keystroke results, conditional fields)
  sorting.test.ts                — custom sort functions
```

### Files to modify (migration phases)

**Phase 1 — Low complexity:**

- `src/components/classes/ClassesTableView.tsx` (102 lines)
- `src/components/entries/management/EntriesTableView.tsx` (171 lines)
- `src/components/shows/browse/ShowsTableView.tsx` (213 lines)

**Phase 2 — Medium complexity:**

- `src/components/dogs/browse/DogsTableView.tsx` (172 lines)
- `src/components/users/browse/PeopleTableView.tsx` (141 lines)
- `src/components/trials/TrialDetail/TrialClassesTable.tsx` (395 lines)
- `src/components/trials/TrialDetail/TrialEntriesTable.tsx` (336 lines)
- `src/components/admin/users/UserTable/index.tsx` (249 lines) + subfiles

**Phase 3 — High complexity:**

- `src/components/classes/ClassEntriesTable/` (15 files)
- `src/components/classes/ClassResultsTable/` (9 files)
- `src/components/templates/admin/ClassDefinitionTable.tsx` (486 lines)

### Files to delete after migration

- `src/components/common/SortableTable.tsx`
- `src/components/base/DataTable.tsx`

---

## Task 1: Install TanStack Table

**Files:**

- Modify: `apps/myk9show/package.json`

- [ ] **Step 1: Install the dependency**

Run from monorepo root:

```bash
cd apps/myk9show && pnpm add @tanstack/react-table
```

- [ ] **Step 2: Verify installation**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: passes (no changes to source yet)

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/package.json pnpm-lock.yaml
git commit -m "chore: add @tanstack/react-table dependency"
```

---

## Task 2: Create types and custom sort functions

**Files:**

- Create: `src/components/ui/data-table/types.ts`
- Create: `src/components/ui/data-table/sorting.ts`
- Create: `src/components/ui/data-table/__tests__/sorting.test.ts`

All file paths in this plan are relative to `apps/myk9show/` unless otherwise noted.

- [ ] **Step 1: Write the sorting test**

Create `src/components/ui/data-table/__tests__/sorting.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatSearchTime, parseSearchTimeDigits } from '../sorting';

describe('formatSearchTime', () => {
  it('formats 4 digits as 0:SS.hh', () => {
    expect(formatSearchTime('4532')).toBe('0:45.32');
  });

  it('formats 5 digits as M:SS.hh', () => {
    expect(formatSearchTime('12345')).toBe('1:23.45');
  });

  it('formats 6 digits as MM:SS.hh', () => {
    expect(formatSearchTime('100032')).toBe('10:00.32');
  });

  it('formats 3 digits as 0:0S.hh', () => {
    expect(formatSearchTime('532')).toBe('0:05.32');
  });

  it('formats 2 digits as hundredths only', () => {
    expect(formatSearchTime('32')).toBe('0:00.32');
  });

  it('formats 1 digit as hundredths only', () => {
    expect(formatSearchTime('5')).toBe('0:00.05');
  });

  it('returns empty string for empty input', () => {
    expect(formatSearchTime('')).toBe('');
  });

  it('caps seconds at 59', () => {
    // 7532 → last 2 = 32 (hundredths), next 2 = 75 → capped at 59
    expect(formatSearchTime('7532')).toBe('1:15.32');
  });
});

describe('parseSearchTimeDigits', () => {
  it('converts formatted time back to digits', () => {
    expect(parseSearchTimeDigits('1:23.45')).toBe('12345');
  });

  it('strips leading zeros from minutes', () => {
    expect(parseSearchTimeDigits('0:45.32')).toBe('4532');
  });

  it('handles hundredths only', () => {
    expect(parseSearchTimeDigits('0:00.32')).toBe('32');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/sorting.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create types.ts**

Create `src/components/ui/data-table/types.ts`:

```typescript
import type { Row, Column } from '@tanstack/react-table';

/** Breakpoint at which a column auto-hides via CSS */
export type ResponsiveBreakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Edit types supported by the built-in editable cell */
export type EditType = 'text' | 'number' | 'select' | 'time' | 'custom';

/** Extended column meta for DataTable features */
export interface DataTableColumnMeta {
  /** Tailwind breakpoint below which this column hides via CSS */
  responsiveHide?: ResponsiveBreakpoint;
  /** Enable inline editing for this column */
  editable?: boolean;
  /** Built-in editor type */
  editType?: EditType;
  /** Options for select-type editor */
  editOptions?: Array<{ label: string; value: string }>;
  /** Validate cell value. Returns error string or null. */
  validate?: (value: unknown) => string | null;
  /** Custom editor component for editType: 'custom' */
  editComponent?: (props: EditComponentProps<unknown>) => React.ReactNode;
}

/** Props passed to custom cell editor components */
export interface EditComponentProps<TValue> {
  value: TValue;
  onChange: (value: TValue) => void;
  onCommit: () => void;
  onCancel: () => void;
  row: Row<unknown>;
  column: Column<unknown>;
}

/** Single cell change for batch save */
export interface CellChange {
  rowId: string;
  columnId: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Scoring mode configuration */
export interface ScoringModeConfig {
  enabled: boolean;
  autoAdvance?: boolean;
  conditionalFields?: Record<string, (row: unknown) => boolean>;
  progressIndicator?: boolean;
}

/** CSS class for responsive column hiding */
export const RESPONSIVE_CLASSES: Record<ResponsiveBreakpoint, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
};
```

- [ ] **Step 4: Create sorting.ts**

Create `src/components/ui/data-table/sorting.ts`:

```typescript
import type { SortingFn } from '@tanstack/react-table';

/**
 * Level progression order for scent work classes.
 * Used as a custom TanStack Table sorting function.
 */
const LEVEL_ORDER = ['Introductory', 'Novice', 'Intermediate', 'Senior', 'Master', 'Champion'];

export const levelProgressionSort: SortingFn<unknown> = (rowA, rowB, columnId) => {
  const aVal = String(rowA.getValue(columnId) ?? '');
  const bVal = String(rowB.getValue(columnId) ?? '');
  const a = LEVEL_ORDER.indexOf(aVal);
  const b = LEVEL_ORDER.indexOf(bVal);
  // Unknown levels sort to the end
  const aIdx = a === -1 ? LEVEL_ORDER.length : a;
  const bIdx = b === -1 ? LEVEL_ORDER.length : b;
  return aIdx - bIdx;
};

/**
 * Format a stream of digits into M:SS.hh search time format.
 * Rule: last 2 digits = hundredths, next 2 = seconds, remainder = minutes.
 * Seconds >59 overflow into minutes.
 */
export function formatSearchTime(digits: string): string {
  if (!digits) return '';

  const padded = digits.padStart(2, '0');
  const hundredths = padded.slice(-2);
  const remaining = padded.slice(0, -2) || '0';
  let totalSeconds = parseInt(remaining, 10) || 0;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}.${hundredths}`;
}

/**
 * Parse formatted time (M:SS.hh) back to raw digits for editing.
 * Strips leading zeros from the result.
 */
export function parseSearchTimeDigits(formatted: string): string {
  const match = formatted.match(/^(\d+):(\d{2})\.(\d{2})$/);
  if (!match) return formatted;
  const [, min, sec, hundredths] = match;
  const raw = `${min}${sec}${hundredths}`;
  // Strip leading zeros but keep at least the hundredths
  return raw.replace(/^0+/, '') || hundredths;
}
```

- [ ] **Step 5: Run tests**

```bash
cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/sorting.test.ts
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/ui/data-table/types.ts apps/myk9show/src/components/ui/data-table/sorting.ts apps/myk9show/src/components/ui/data-table/__tests__/sorting.test.ts
git commit -m "feat(data-table): add types and sorting utilities with tests"
```

---

## Task 3: Build the core DataTable component

**Files:**

- Create: `src/components/ui/data-table/data-table-column-header.tsx`
- Create: `src/components/ui/data-table/data-table-pagination.tsx`
- Create: `src/components/ui/data-table/index.tsx`
- Create: `src/components/ui/data-table/__tests__/data-table.test.tsx`

- [ ] **Step 1: Write the core DataTable test**

Create `src/components/ui/data-table/__tests__/data-table.test.tsx`:

```typescript
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../index';

interface TestRow {
  id: string;
  name: string;
  age: number;
  email: string;
}

const testData: TestRow[] = [
  { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
  { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
  { id: '3', name: 'Charlie', age: 35, email: 'charlie@test.com' },
];

const columns: ColumnDef<TestRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'age', header: 'Age' },
  { accessorKey: 'email', header: 'Email' },
];

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable columns={columns} data={testData} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders row data', () => {
    render(<DataTable columns={columns} data={testData} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('shows empty state when data is empty', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('No results found.')).toBeInTheDocument();
  });

  it('shows custom empty state', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyState={<div>Custom empty</div>}
      />
    );
    expect(screen.getByText('Custom empty')).toBeInTheDocument();
  });

  it('sorts by column on header click', async () => {
    const { user } = render(<DataTable columns={columns} data={testData} />);
    const nameHeader = screen.getByRole('button', { name: /name/i });
    await user.click(nameHeader);

    const rows = screen.getAllByRole('row');
    // row 0 is header, rows 1-3 are data
    expect(within(rows[1]).getByText('Alice')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Bob')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Charlie')).toBeInTheDocument();
  });

  it('sorts descending on second header click', async () => {
    const { user } = render(<DataTable columns={columns} data={testData} />);
    const nameHeader = screen.getByRole('button', { name: /name/i });
    await user.click(nameHeader);
    await user.click(nameHeader);

    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Charlie')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Bob')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Alice')).toBeInTheDocument();
  });

  it('calls onRowClick when a row is clicked', async () => {
    const handleClick = vi.fn();
    const { user } = render(
      <DataTable columns={columns} data={testData} onRowClick={handleClick} />
    );
    await user.click(screen.getByText('Alice'));
    expect(handleClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', name: 'Alice' }),
      expect.anything()
    );
  });

  it('applies cursor-pointer class when onRowClick is set', () => {
    render(
      <DataTable columns={columns} data={testData} onRowClick={() => {}} />
    );
    const row = screen.getByText('Alice').closest('tr');
    expect(row).toHaveClass('cursor-pointer');
  });

  it('shows loading skeleton when loading is true', () => {
    render(<DataTable columns={columns} data={[]} loading />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/data-table.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create data-table-column-header.tsx**

Create `src/components/ui/data-table/data-table-column-header.tsx`:

```typescript
import { type Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableColumnHeaderProps<TData> {
  column: Column<TData, unknown>;
  title: string;
  className?: string;
}

export function DataTableColumnHeader<TData>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData>) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>;
  }

  const sorted = column.getIsSorted();
  const sortIndex = column.getSortIndex();

  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1.5 hover:text-foreground transition-colors -ml-1 px-1',
        className
      )}
      onClick={column.getToggleSortingHandler()}
    >
      {title}
      {sorted === 'asc' ? (
        <ArrowUp className="h-3 w-3" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-30" />
      )}
      {sortIndex > 0 && (
        <span className="text-[10px] font-normal text-muted-foreground">
          {sortIndex + 1}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Create data-table-pagination.tsx**

Create `src/components/ui/data-table/data-table-pagination.tsx`:

```typescript
import { type Table } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  pageSizeOptions?: number[];
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 25, 50, 100],
}: DataTablePaginationProps<TData>) {
  const totalRows = table.getFilteredRowModel().rows.length;
  const pageSize = table.getState().pagination.pageSize;

  // Auto-hide when all rows fit on one page
  if (totalRows <= pageSize) return null;

  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();
  const selectedCount = table.getSelectedRowModel().rows.length;

  const from = pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
      <div className="text-sm text-muted-foreground">
        {selectedCount > 0 ? (
          <span>{selectedCount} of {totalRows} selected</span>
        ) : (
          <span>Showing {from}–{to} of {totalRows} entries</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={pageSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>

        <span className="text-sm text-muted-foreground">
          Page {pageIndex + 1} of {pageCount}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="Go to first page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Go to next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Go to last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the main DataTable component (index.tsx)**

Create `src/components/ui/data-table/index.tsx`:

```typescript
import { type ReactNode, useMemo } from 'react';
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
  type Table as TanstackTable,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DataTableColumnHeader } from './data-table-column-header';
import { DataTablePagination } from './data-table-pagination';
import { type DataTableColumnMeta, RESPONSIVE_CLASSES } from './types';

export type { ColumnDef } from '@tanstack/react-table';
export { DataTableColumnHeader } from './data-table-column-header';
export { DataTablePagination } from './data-table-pagination';
export { levelProgressionSort, formatSearchTime, parseSearchTimeDigits } from './sorting';
export type { DataTableColumnMeta, EditComponentProps, CellChange, ScoringModeConfig } from './types';

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Default page size. Default: 25. */
  pageSize?: number;
  /** Page size options. Default: [10, 25, 50, 100]. */
  pageSizeOptions?: number[];
  /** Enable multi-sort. Default: true, max 3. */
  enableMultiSort?: boolean;
  /** Row click handler. Receives (originalData, row). */
  onRowClick?: (data: TData, row: unknown) => void;
  /** Row selection mode. Off by default. */
  selectable?: 'single' | 'multi';
  /** Selection change callback. */
  onSelectionChange?: (selectedRows: TData[]) => void;
  /** Row identity accessor. Defaults to (row) => row.id. */
  getRowId?: (row: TData) => string;
  /** Composable toolbar render prop. */
  toolbar?: (props: { table: TanstackTable<TData> }) => ReactNode;
  /** Custom empty state. */
  emptyState?: ReactNode;
  /** Show loading skeleton. */
  loading?: boolean;
  /** Global filter value (controlled). */
  globalFilter?: string;
  /** Global filter change handler. */
  onGlobalFilterChange?: (value: string) => void;
  /** Disable client-side sorting (for pre-sorted data). */
  manualSorting?: boolean;
  /** Additional className for the outer wrapper. */
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  pageSize = 25,
  pageSizeOptions,
  enableMultiSort = true,
  onRowClick,
  selectable,
  onSelectionChange,
  getRowId = (row: TData) => (row as Record<string, unknown>).id as string,
  toolbar,
  emptyState,
  loading = false,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange,
  manualSorting = false,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });
  const [internalGlobalFilter, setInternalGlobalFilter] = useState('');

  const globalFilterValue = controlledGlobalFilter ?? internalGlobalFilter;
  const setGlobalFilterValue = onGlobalFilterChange ?? setInternalGlobalFilter;

  // Prepend selection column if selectable
  const allColumns = useMemo(() => {
    if (!selectable) return columns;

    const selectionColumn: ColumnDef<TData, unknown> = {
      id: '_select',
      header: selectable === 'multi'
        ? ({ table }) => (
            <input
              type="checkbox"
              checked={table.getIsAllPageRowsSelected()}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
              aria-label="Select all rows on this page"
            />
          )
        : undefined,
      cell: ({ row }) => (
        <input
          type={selectable === 'multi' ? 'checkbox' : 'radio'}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    };

    return [selectionColumn, ...columns];
  }, [columns, selectable]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter: globalFilterValue,
      pagination,
    },
    enableMultiSort,
    maxMultiSortColCount: 3,
    enableRowSelection: !!selectable,
    enableMultiRowSelection: selectable === 'multi',
    manualSorting,
    getRowId,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(next);
      if (onSelectionChange) {
        const selectedRows = Object.keys(next)
          .filter((key) => next[key])
          .map((key) => {
            const row = table.getRow(key);
            return row.original;
          });
        onSelectionChange(selectedRows);
      }
    },
    onGlobalFilterChange: setGlobalFilterValue,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
  });

  const getResponsiveClass = (columnId: string) => {
    const colDef = allColumns.find(
      (c) => ('accessorKey' in c && c.accessorKey === columnId) || c.id === columnId
    );
    const meta = (colDef?.meta as DataTableColumnMeta | undefined);
    if (meta?.responsiveHide) {
      return RESPONSIVE_CLASSES[meta.responsiveHide];
    }
    return '';
  };

  return (
    <div className={cn('rounded-xl border border-border/50 bg-card/95 backdrop-blur-sm overflow-hidden', className)}>
      {toolbar?.({ table })}

      {/* Table component has its own overflow-auto wrapper, no need to double-wrap */}
      <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b border-border/50 bg-muted/30">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'px-4 py-3 text-left font-medium text-muted-foreground',
                      getResponsiveClass(header.column.id)
                    )}
                    aria-sort={
                      header.column.getIsSorted() === 'asc' ? 'ascending'
                        : header.column.getIsSorted() === 'desc' ? 'descending'
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <DataTableColumnHeader
                        column={header.column}
                        title={flexRender(header.column.columnDef.header, header.getContext()) as string}
                      />
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {allColumns.map((_, j) => (
                    <TableCell key={`skeleton-${i}-${j}`} className="px-4 py-3">
                      <Skeleton className="h-4 w-full animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {data.length > 0 ? (
                    <div>
                      <p>No results match your filters.</p>
                      <button
                        type="button"
                        className="text-sm underline mt-1 hover:text-foreground"
                        onClick={() => {
                          table.resetColumnFilters();
                          setGlobalFilterValue('');
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    emptyState ?? 'No results found.'
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(
                    'border-b border-border/30 hover:bg-muted/20 transition-colors',
                    onRowClick && 'cursor-pointer'
                  )}
                  onClick={() => onRowClick?.(row.original, row)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn('px-4 py-3', getResponsiveClass(cell.column.id))}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

      <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />
    </div>
  );
}
```

- [ ] **Step 6: Run tests**

```bash
cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/data-table.test.tsx
```

Expected: all pass. Some tests may need adjustment based on how the test utilities handle the table rendering — iterate until green.

- [ ] **Step 7: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: passes

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/components/ui/data-table/
git commit -m "feat(data-table): core DataTable component with sorting, pagination, selection"
```

---

## Task 4: Build toolbar components

**Files:**

- Create: `src/components/ui/data-table/data-table-toolbar.tsx`
- Create: `src/components/ui/data-table/data-table-search.tsx`
- Create: `src/components/ui/data-table/data-table-filter.tsx`
- Create: `src/components/ui/data-table/data-table-column-toggle.tsx`
- Create: `src/components/ui/data-table/__tests__/data-table-search.test.tsx`

- [ ] **Step 1: Write the search test**

Create `src/components/ui/data-table/__tests__/data-table-search.test.tsx`:

```typescript
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../index';
import { DataTableToolbar } from '../data-table-toolbar';
import { DataTableSearch } from '../data-table-search';

interface TestRow {
  id: string;
  name: string;
  email: string;
}

const testData: TestRow[] = [
  { id: '1', name: 'Alice', email: 'alice@test.com' },
  { id: '2', name: 'Bob', email: 'bob@test.com' },
  { id: '3', name: 'Charlie', email: 'charlie@test.com' },
];

const columns: ColumnDef<TestRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
];

describe('DataTableSearch', () => {
  it('filters rows by search term', async () => {
    const { user } = render(
      <DataTable
        columns={columns}
        data={testData}
        toolbar={({ table }) => (
          <DataTableToolbar table={table}>
            <DataTableSearch placeholder="Search..." />
          </DataTableToolbar>
        )}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search...');
    await user.type(searchInput, 'Alice');

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 400));

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('shows all rows when search is cleared', async () => {
    const { user } = render(
      <DataTable
        columns={columns}
        data={testData}
        toolbar={({ table }) => (
          <DataTableToolbar table={table}>
            <DataTableSearch placeholder="Search..." />
          </DataTableToolbar>
        )}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search...');
    await user.type(searchInput, 'Alice');
    await new Promise((r) => setTimeout(r, 400));
    await user.clear(searchInput);
    await new Promise((r) => setTimeout(r, 400));

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/data-table-search.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create data-table-toolbar.tsx**

Create `src/components/ui/data-table/data-table-toolbar.tsx`:

```typescript
import { createContext, useContext, type ReactNode } from 'react';
import type { Table } from '@tanstack/react-table';

// Context so toolbar children (Search, Filter, ColumnToggle) can access the
// table instance without requiring an explicit `table` prop on each one.
const TableContext = createContext<Table<unknown> | null>(null);

export function useDataTableContext<TData>() {
  const ctx = useContext(TableContext) as Table<TData> | null;
  if (!ctx) throw new Error('useDataTableContext must be used within DataTableToolbar');
  return ctx;
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  children: ReactNode;
}

export function DataTableToolbar<TData>({
  table,
  children,
}: DataTableToolbarProps<TData>) {
  return (
    <TableContext.Provider value={table as unknown as Table<unknown>}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2 flex-1">{children}</div>
      </div>
    </TableContext.Provider>
  );
}
```

Children like `DataTableSearch`, `DataTableFilter`, and `DataTableColumnToggle` use `useDataTableContext()` to get the table instance, so consumers write `<DataTableSearch placeholder="Search..." />` without passing `table` explicitly.

- [ ] **Step 4: Create data-table-search.tsx**

Create `src/components/ui/data-table/data-table-search.tsx`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDataTableContext } from './data-table-toolbar';

interface DataTableSearchProps {
  placeholder?: string;
  debounceMs?: number;
}

export function DataTableSearch({
  placeholder = 'Search...',
  debounceMs = 300,
}: DataTableSearchProps) {
  const table = useDataTableContext();
  const [value, setValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const applyFilter = useCallback(
    (searchValue: string) => {
      table.setGlobalFilter(searchValue || undefined);
    },
    [table]
  );

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => applyFilter(value), debounceMs);
    return () => clearTimeout(timerRef.current);
  }, [value, debounceMs, applyFilter]);

  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 pl-8 pr-8 text-sm"
      />
      {value && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setValue('');
            applyFilter('');
          }}
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create data-table-filter.tsx**

Create `src/components/ui/data-table/data-table-filter.tsx`:

```typescript
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useDataTableContext } from './data-table-toolbar';

interface DataTableFilterProps {
  /** Column accessorKey to filter on */
  column: string;
  title: string;
  options: Array<{ label: string; value: string }>;
}

export function DataTableFilter({
  column: columnId,
  title,
  options,
}: DataTableFilterProps) {
  const table = useDataTableContext();
  const column = table.getColumn(columnId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filterValue = (column?.getFilterValue() as string[] | undefined) ?? [];

  if (!column) return null;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (value: string) => {
    const next = filterValue.includes(value)
      ? filterValue.filter((v) => v !== value)
      : [...filterValue, value];
    column.setFilterValue(next.length > 0 ? next : undefined);
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={() => setOpen(!open)}
      >
        {title}
        {filterValue.length > 0 && (
          <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-primary">
            {filterValue.length}
          </span>
        )}
        <ChevronDown className="ml-1 h-3 w-3" />
      </Button>

      {filterValue.length > 0 && (
        <button
          type="button"
          className="ml-1 text-muted-foreground hover:text-foreground"
          onClick={() => column.setFilterValue(undefined)}
          aria-label={`Clear ${title} filter`}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
                filterValue.includes(option.value) && 'bg-accent/50'
              )}
              onClick={() => toggleOption(option.value)}
            >
              <Check
                className={cn(
                  'h-3 w-3',
                  filterValue.includes(option.value) ? 'opacity-100' : 'opacity-0'
                )}
              />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create data-table-column-toggle.tsx**

Create `src/components/ui/data-table/data-table-column-toggle.tsx`:

```typescript
import { Button } from '@/components/ui/button';
import { Columns3 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useDataTableContext } from './data-table-toolbar';

export function DataTableColumnToggle() {
  const table = useDataTableContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleableColumns = table
    .getAllColumns()
    .filter((col) => col.getCanHide());

  return (
    <div className="relative ml-auto" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={() => setOpen(!open)}
        aria-label="Toggle columns"
      >
        <Columns3 className="h-3.5 w-3.5 mr-1" />
        Columns
      </Button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
          {toggleableColumns.map((column) => (
            <label
              key={column.id}
              className={cn(
                'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
                !column.getIsVisible() && 'opacity-50'
              )}
            >
              <input
                type="checkbox"
                checked={column.getIsVisible()}
                onChange={column.getToggleVisibilityHandler()}
              />
              {typeof column.columnDef.header === 'string'
                ? column.columnDef.header
                : column.id}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Update index.tsx exports**

Add these exports to the top of `src/components/ui/data-table/index.tsx`:

```typescript
export { DataTableToolbar } from './data-table-toolbar';
export { DataTableSearch } from './data-table-search';
export { DataTableFilter } from './data-table-filter';
export { DataTableColumnToggle } from './data-table-column-toggle';
```

- [ ] **Step 8: Run tests**

```bash
cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/
```

Expected: all pass

- [ ] **Step 9: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 10: Commit**

```bash
git add apps/myk9show/src/components/ui/data-table/
git commit -m "feat(data-table): add toolbar, search, filter, and column toggle components"
```

---

## Task 5: Migrate ClassesTableView (Phase 1)

**Files:**

- Modify: `src/components/classes/ClassesTableView.tsx` (102 lines)

This is the first migration — proves the pattern. ClassesTableView currently uses `SortableTable` with simple string columns.

- [ ] **Step 1: Read the current ClassesTableView**

Read `src/components/classes/ClassesTableView.tsx` to understand the current column definitions, props, and rendering.

- [ ] **Step 2: Rewrite ClassesTableView to use DataTable**

Replace the SortableTable import and usage with DataTable. Key changes:

- Import `DataTable`, `type ColumnDef` from `@/components/ui/data-table`
- Import `levelProgressionSort` from `@/components/ui/data-table` if the Level column exists
- Define `columns` as `ColumnDef<TrialClass>[]` using `accessorKey` and custom `cell` renderers
- Replace `<SortableTable>` with `<DataTable>`
- Move `onRowClick` from SortableTable's pattern to DataTable's `onRowClick` prop
- Remove the old `ColumnDef` import from SortableTable

- [ ] **Step 3: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 4: Run existing tests if any, and manually verify in browser**

```bash
cd apps/myk9show && npx vitest run --testPathPattern='ClassesTableView'
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassesTableView.tsx
git commit -m "refactor: migrate ClassesTableView to DataTable"
```

---

## Task 6: Migrate EntriesTableView (Phase 1)

**Files:**

- Modify: `src/components/entries/management/EntriesTableView.tsx` (171 lines)

Same pattern as Task 5. Replace SortableTable with DataTable.

- [ ] **Step 1: Read the current EntriesTableView**

Read the file. Understand columns, props, and the `renderCell` implementation.

- [ ] **Step 2: Rewrite to use DataTable**

Replace SortableTable with DataTable. Port each column's `getValue` + `renderCell` logic into TanStack `accessorFn` + `cell` renderers.

- [ ] **Step 3: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/entries/management/EntriesTableView.tsx
git commit -m "refactor: migrate EntriesTableView to DataTable"
```

---

## Task 7: Migrate ShowsTableView (Phase 1)

**Files:**

- Modify: `src/components/shows/browse/ShowsTableView.tsx` (213 lines)

Same pattern. This is the last SortableTable consumer.

- [ ] **Step 1: Read the current ShowsTableView**

Read the file. Note any custom rendering in cells (date formatting, status badges, etc.).

- [ ] **Step 2: Rewrite to use DataTable**

Replace SortableTable with DataTable. Port all column logic.

- [ ] **Step 3: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/shows/browse/ShowsTableView.tsx
git commit -m "refactor: migrate ShowsTableView to DataTable"
```

---

## Task 8: Delete SortableTable and base DataTable

**Files:**

- Delete: `src/components/common/SortableTable.tsx`
- Delete: `src/components/base/DataTable.tsx`
- Modify: `src/components/common/index.ts` (remove SortableTable exports)

- [ ] **Step 1: Verify no remaining imports**

Search for any remaining imports of SortableTable or base DataTable:

```bash
cd apps/myk9show && grep -r "SortableTable\|from.*base/DataTable" src/ --include="*.ts" --include="*.tsx"
```

Expected: only `src/components/common/index.ts` barrel file (all consumers migrated in Tasks 5–7, base DataTable has 0 consumers)

- [ ] **Step 2: Remove SortableTable exports from barrel file**

Edit `src/components/common/index.ts` — remove the `SortableTable` re-export and any type re-exports (`SortDirection`, `ColumnDef`).

- [ ] **Step 3: Delete the files**

```bash
rm apps/myk9show/src/components/common/SortableTable.tsx
rm apps/myk9show/src/components/base/DataTable.tsx
```

- [ ] **Step 4: Run typecheck to confirm nothing breaks**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 5: Run full test suite**

```bash
cd apps/myk9show && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "refactor: remove SortableTable and base DataTable — replaced by data-table"
```

---

## Task 9: Migrate DogsTableView (Phase 2)

**Files:**

- Modify: `src/components/dogs/browse/DogsTableView.tsx` (172 lines)

This table uses inline `useState` for sort state instead of SortableTable. Migration involves removing the custom sort state and letting DataTable handle it.

- [ ] **Step 1: Read the current file**

Read `src/components/dogs/browse/DogsTableView.tsx`. Identify the sort state variables, column definitions, and any custom cell rendering.

- [ ] **Step 2: Rewrite to use DataTable**

- Remove `useState` for `sortColumn`/`sortDirection`
- Remove the inline `useMemo` sort logic
- Define TanStack `ColumnDef[]` with appropriate `accessorKey`/`accessorFn`
- Replace the raw `<table>` markup with `<DataTable>`
- Preserve any custom cell rendering (breed badges, etc.)

- [ ] **Step 3: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/dogs/browse/DogsTableView.tsx
git commit -m "refactor: migrate DogsTableView to DataTable"
```

---

## Task 10: Migrate PeopleTableView (Phase 2)

**Files:**

- Modify: `src/components/users/browse/PeopleTableView.tsx` (141 lines)

Same pattern as DogsTableView — inline sort state to remove.

- [ ] **Step 1: Read and rewrite**

Read the file, remove inline sort logic, replace with DataTable + column defs.

- [ ] **Step 2: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/users/browse/PeopleTableView.tsx
git commit -m "refactor: migrate PeopleTableView to DataTable"
```

---

## Task 11: Migrate TrialClassesTable (Phase 2)

**Files:**

- Modify: `src/components/trials/TrialDetail/TrialClassesTable.tsx` (395 lines)
- Test: `src/test/components/trials/TrialClassesTable.test.tsx`

This table has custom sort logic including level progression sort, a search filter, and a table/cards view toggle. The search moves to DataTableToolbar. The level progression sort uses the new `levelProgressionSort` function. The view toggle stays external to DataTable (it's a parent concern).

- [ ] **Step 1: Read the current file**

Read `src/components/trials/TrialDetail/TrialClassesTable.tsx`. Map the custom sort logic, search filter, and view toggle.

- [ ] **Step 2: Rewrite to use DataTable**

- Remove custom sort state and logic
- Move search to `DataTableSearch` in a toolbar
- Use `levelProgressionSort` for the Level column
- Keep the table/cards toggle outside DataTable (conditional rendering)
- Preserve section info rendering in cells

- [ ] **Step 3: Update tests**

Read and update `src/test/components/trials/TrialClassesTable.test.tsx` to work with the new DataTable rendering. The tests should still verify the same behavior (sorting, search filtering, view toggle).

- [ ] **Step 4: Run tests**

```bash
cd apps/myk9show && npx vitest run src/test/components/trials/TrialClassesTable.test.tsx
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/trials/TrialDetail/TrialClassesTable.tsx apps/myk9show/src/test/components/trials/TrialClassesTable.test.tsx
git commit -m "refactor: migrate TrialClassesTable to DataTable with level progression sort"
```

---

## Task 12: Migrate TrialEntriesTable (Phase 2)

**Files:**

- Modify: `src/components/trials/TrialDetail/TrialEntriesTable.tsx` (336 lines)

This table uses custom sort + search and React Query for data fetching. React Query integration stays the same — DataTable just receives the `data` from the query. Search moves to toolbar.

- [ ] **Step 1: Read and rewrite**

Read the file. Replace custom sort/search with DataTable + toolbar. Keep React Query data fetching unchanged — just pass `data` and `loading` to DataTable.

- [ ] **Step 2: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx
git commit -m "refactor: migrate TrialEntriesTable to DataTable"
```

---

## Task 13: Migrate UserTable (Phase 2)

**Files:**

- Modify: `src/components/admin/users/UserTable/index.tsx` (249 lines)
- Modify: `src/components/admin/users/UserTable/UserTableHeader.tsx`
- Modify: `src/components/admin/users/UserTable/Pagination.tsx`
- Modify: `src/components/admin/users/UserTable/UserTableRow.tsx`
- Modify: `src/components/admin/users/UserTable/UserTableSkeleton.tsx`
- Modify: `src/components/admin/users/UserTable/UserTableEmptyState.tsx`
- Test: `src/components/admin/users/UserTable/utils.test.ts`

UserTable is the most complex Phase 2 table. It has custom pagination, multi-select, and density modes. Pagination and selection are handled by DataTable now. Density mode can be a simple className toggle.

- [ ] **Step 1: Read all UserTable files**

Read `index.tsx`, `UserTableHeader.tsx`, `Pagination.tsx`, `UserTableRow.tsx`, `UserTableSkeleton.tsx`, `UserTableEmptyState.tsx`, and `types.ts` to understand the full component structure.

- [ ] **Step 2: Rewrite index.tsx to use DataTable**

- Remove custom pagination state — DataTable handles it
- Remove custom selection state — use DataTable's `selectable="multi"` + `onSelectionChange`
- Move search to DataTableSearch in toolbar
- Replace UserTableHeader, custom Pagination, and custom skeleton with DataTable equivalents
- Keep density toggle as a `className` applied to the DataTable wrapper
- Keep row actions (edit, delete) as an actions column

- [ ] **Step 3: Delete now-unused subcomponents**

After migration, these subcomponents are likely unnecessary:

- `UserTableHeader.tsx` (replaced by DataTable column headers)
- `Pagination.tsx` (replaced by DataTablePagination)
- `UserTableSkeleton.tsx` (replaced by DataTable's loading prop)
- `UserTableEmptyState.tsx` (replaced by DataTable's emptyState prop)

Only delete files that are confirmed unused. `UserTableRow.tsx` may still be needed if it has complex cell rendering that doesn't fit in a column `cell` renderer. Check first.

- [ ] **Step 4: Update tests**

```bash
cd apps/myk9show && npx vitest run src/components/admin/users/UserTable/
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/admin/users/UserTable/
git commit -m "refactor: migrate UserTable to DataTable with selection and pagination"
```

---

## Task 14: Build inline editing infrastructure

**Files:**

- Create: `src/components/ui/data-table/data-table-editable-cell.tsx`
- Create: `src/components/ui/data-table/__tests__/data-table-editable-cell.test.tsx`

This must be complete before Phase 3 tables can be migrated.

- [ ] **Step 1: Write the editable cell test**

Create `src/components/ui/data-table/__tests__/data-table-editable-cell.test.tsx`:

Test cases:

- Renders display value when not editing
- Enters edit mode on click
- Shows text input for `editType: 'text'`
- Shows select for `editType: 'select'`
- Tab moves to next editable cell
- Shift+Tab moves to previous editable cell
- Enter confirms and moves down
- Escape cancels edit and reverts value
- Shows validation error below cell
- Shows dirty indicator (left border) when value changed
- Calls `onSave` callback when auto-save fires

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/data-table-editable-cell.test.tsx
```

- [ ] **Step 3: Implement EditableCell**

Create `src/components/ui/data-table/data-table-editable-cell.tsx`. The component:

- Wraps a cell with click-to-edit behavior
- Manages local editing state
- Renders the appropriate input based on `editType`
- Handles keyboard navigation (Tab, Shift+Tab, Enter, Escape)
- Calls `onSave` on blur/commit
- Shows validation errors
- Applies dirty indicator styles

- [ ] **Step 4: Run tests**

```bash
cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/data-table-editable-cell.test.tsx
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/ui/data-table/data-table-editable-cell.tsx apps/myk9show/src/components/ui/data-table/__tests__/data-table-editable-cell.test.tsx
git commit -m "feat(data-table): add inline editable cell component with keyboard navigation"
```

---

## Task 15: Build scoring mode and smart time input

**Files:**

- Create: `src/components/ui/data-table/data-table-time-input.tsx`
- Create: `src/components/ui/data-table/data-table-scoring-mode.tsx`
- Create: `src/components/ui/data-table/__tests__/data-table-time-input.test.tsx`
- Create: `src/components/ui/data-table/__tests__/data-table-scoring-mode.test.tsx`

- [ ] **Step 1: Write time input test**

Create `src/components/ui/data-table/__tests__/data-table-time-input.test.tsx`:

Test cases:

- Renders raw digits while focused
- Formats to M:SS.hh on blur
- Shows raw digits when clicking into existing formatted time
- Handles all digit-count variations (2–6 digits)
- Tab triggers format + advance
- Only accepts numeric input

- [ ] **Step 2: Write scoring mode test**

Create `src/components/ui/data-table/__tests__/data-table-scoring-mode.test.tsx`:

Test cases:

- Auto-advance: after entering time and pressing Tab, focus moves to Result cell in same row
- Auto-advance: after entering Result (clean Q), focus skips Faults/Reason and moves to next row's Time
- Auto-advance: after entering Result (NQ), focus moves to Faults, then Reason, then next row's Time
- Single-keystroke results: typing `Q` in result cell sets value to "Qualify" and auto-advances
- Single-keystroke results: typing `N` sets "NQ", `E` sets "Eliminated", `A` sets "Absent"
- Conditional fields: Reason column is not editable when result is "Qualify"
- Conditional fields: Reason column becomes editable when result is "NQ" or "Eliminated"
- Faults column is always editable regardless of result
- Progress indicator shows "X of Y scored" count
- Progress indicator updates as entries are scored
- Ctrl+Z undoes last cell edit and moves cursor back

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/data-table-time-input.test.tsx src/components/ui/data-table/__tests__/data-table-scoring-mode.test.tsx
```

- [ ] **Step 4: Implement TimeInput**

Create `src/components/ui/data-table/data-table-time-input.tsx`. Uses `formatSearchTime` and `parseSearchTimeDigits` from `sorting.ts`. The component:

- Shows raw digits in an input while focused
- Formats to `M:SS.hh` on blur via `formatSearchTime`
- On focus, converts formatted time back to raw digits via `parseSearchTimeDigits`
- Filters non-numeric input
- Calls `onCommit` on Tab/Enter to trigger auto-advance

- [ ] **Step 5: Implement ScoringMode**

Create `src/components/ui/data-table/data-table-scoring-mode.tsx`. This is a hook + wrapper that provides:

- **Auto-advance logic:** Tracks current cell position. On commit, determines next cell based on result value and conditional field rules. Skips non-editable/inactive cells.
- **Single-keystroke result handler:** Intercepts keydown on result cells. Maps Q→Qualify, N→NQ, E→Eliminated, A→Absent (and numeric 1/2/3/4). Immediately sets value and triggers auto-advance.
- **Conditional field activation:** Accepts a `conditionalFields` config mapping column IDs to predicate functions. Cells for inactive fields are rendered as read-only.
- **Progress indicator:** Component that renders "X of Y scored" based on which rows have a non-empty result value.
- **Undo stack:** Maintains a stack of `{ rowId, columnId, oldValue }` entries. Ctrl+Z pops the stack, reverts the cell, and moves focus back.

- [ ] **Step 6: Run tests**

```bash
cd apps/myk9show && npx vitest run src/components/ui/data-table/__tests__/data-table-time-input.test.tsx
```

- [ ] **Step 7: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/components/ui/data-table/data-table-time-input.tsx apps/myk9show/src/components/ui/data-table/data-table-scoring-mode.tsx apps/myk9show/src/components/ui/data-table/__tests__/data-table-time-input.test.tsx apps/myk9show/src/components/ui/data-table/__tests__/data-table-scoring-mode.test.tsx
git commit -m "feat(data-table): add smart time input and scoring mode components"
```

---

## Task 16: Migrate ClassEntriesTable (Phase 3)

**Files:**

- Modify: `src/components/classes/ClassEntriesTable/ClassEntriesTable.tsx`
- Modify: `src/components/classes/ClassEntriesTable/index.ts`
- Modify: `src/components/classes/ClassEntriesTable/types.ts`
- Potentially remove: `components/EditableCells.tsx`, `EntriesTableHeader.tsx`, `SaveBar.tsx` (replaced by DataTable equivalents)
- Keep: `hooks/useInlineEditing.ts` (may be adapted), `DeleteDialog.tsx`, `EntryActionsMenu.tsx`
- Test: `src/components/classes/ClassEntriesTable/__tests__/`

This is a high-complexity migration. The inline editing, filtering, and keyboard navigation are replaced by DataTable's editing infrastructure. Domain-specific logic in `useInlineEditing` may need adaptation.

- [ ] **Step 1: Read all ClassEntriesTable files thoroughly**

Read every file in the directory to understand the full component tree, data flow, and behavior.

- [ ] **Step 2: Define the DataTable column definitions**

Create the column defs using `meta.editable`, `meta.editType`, and custom cell renderers for status, time, score, and placement.

- [ ] **Step 3: Rewrite the main component**

Replace the custom table rendering with DataTable. Keep:

- Filter toolbar (move to DataTableToolbar)
- Inline editing (use DataTable's editing infrastructure)
- CSV export (keep as toolbar action)
- Entry actions menu (keep as actions column)
- Delete dialog (keep, triggered from actions)

- [ ] **Step 4: Clean up unused subcomponents**

Delete subcomponents that are fully replaced by DataTable equivalents. Keep domain-specific components (DeleteDialog, EntryActionsMenu).

- [ ] **Step 5: Update tests**

```bash
cd apps/myk9show && npx vitest run src/components/classes/ClassEntriesTable/__tests__/
```

- [ ] **Step 6: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassEntriesTable/
git commit -m "refactor: migrate ClassEntriesTable to DataTable with inline editing"
```

---

## Task 17: Migrate ClassResultsTable (Phase 3)

**Files:**

- Modify: `src/components/classes/ClassResultsTable/index.tsx`
- Modify: `src/components/classes/ClassResultsTable/types.ts`
- Keep: `useClassResults.ts` (domain hook — stays external)
- Potentially remove: `ResultsTableRow.tsx`, `QualificationCell.tsx` (replaced by DataTable cell renderers)
- Keep: `DogInfoTooltip.tsx`, `StatusBadge.tsx`, `constants.ts`

This table gets scoring mode. The `useClassResults` domain hook handles data transformation and business logic. DataTable handles the UI.

- [ ] **Step 1: Read all ClassResultsTable files**

Understand the `useClassResults` hook, `BulkEntryData` model, qualification cell behavior, and submit flow. Also read `src/components/classes/__tests__/ClassResultsTableHeader.test.tsx` — this existing test file tests the header button behavior and will need updating.

- [ ] **Step 2: Define scoring-mode column definitions**

Map the existing columns to DataTable columns with scoring mode:

- Time → `editType: 'time'` (smart time input)
- Result/Qualification → `editType: 'custom'` with single-keystroke handler
- Faults → `editType: 'number'`, always editable
- Reason → `editType: 'select'`, conditional on result

- [ ] **Step 3: Rewrite index.tsx**

Replace custom table rendering with DataTable + `scoringMode`. Wire `useClassResults` callbacks to `onSave`.

- [ ] **Step 4: Update tests**

Update both `src/components/classes/__tests__/ClassResultsTableHeader.test.tsx` and any tests within the ClassResultsTable directory:

```bash
cd apps/myk9show && npx vitest run --testPathPattern='ClassResultsTable'
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/ apps/myk9show/src/components/classes/__tests__/ClassResultsTableHeader.test.tsx
git commit -m "refactor: migrate ClassResultsTable to DataTable with scoring mode"
```

---

## Task 18: Migrate ClassDefinitionTable (Phase 3)

**Files:**

- Modify: `src/components/templates/admin/ClassDefinitionTable.tsx` (486 lines)

This table has drag-to-reorder (native HTML5 drag currently), multi-select with checkboxes, inline display-order editing, bulk delete, and row duplication. It uses `@dnd-kit` patterns (the lib is already installed).

- [ ] **Step 1: Read the current file**

Read `src/components/templates/admin/ClassDefinitionTable.tsx` thoroughly. Map drag-and-drop behavior, selection logic, inline editing, and bulk actions.

- [ ] **Step 2: Rewrite to use DataTable**

- Use `selectable="multi"` for checkbox selection
- Use DataTable inline editing for display order
- Integrate `@dnd-kit` for drag-to-reorder (DataTable renders rows, `@dnd-kit` wraps them)
- Move bulk actions (delete, duplicate) to toolbar
- Set `manualSorting={true}` when in drag-reorder mode

- [ ] **Step 3: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/templates/admin/ClassDefinitionTable.tsx
git commit -m "refactor: migrate ClassDefinitionTable to DataTable with drag-reorder and selection"
```

---

## Task 19: Final cleanup and verification

**Files:**

- Verify all old table imports are gone
- Run full test suite
- Run typecheck

- [ ] **Step 1: Search for stale imports**

```bash
cd apps/myk9show && grep -r "SortableTable\|from.*base/DataTable\|from.*common/SortableTable" src/ --include="*.ts" --include="*.tsx"
```

Expected: no results

- [ ] **Step 2: Run full typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Run full test suite**

```bash
cd apps/myk9show && pnpm test
```

- [ ] **Step 4: Run lint**

```bash
pnpm lint
```

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -u
git commit -m "chore: final cleanup after DataTable migration"
```

---

## Summary

| Phase         | Tasks | Tables Migrated                                                                 |
| ------------- | ----- | ------------------------------------------------------------------------------- |
| Setup         | 1–4   | — (install, build DataTable + toolbar)                                          |
| Phase 1       | 5–8   | ClassesTableView, EntriesTableView, ShowsTableView + delete old                 |
| Phase 2       | 9–13  | DogsTableView, PeopleTableView, TrialClassesTable, TrialEntriesTable, UserTable |
| Editing infra | 14–15 | — (editable cell, scoring mode, time input)                                     |
| Phase 3       | 16–18 | ClassEntriesTable, ClassResultsTable, ClassDefinitionTable                      |
| Cleanup       | 19    | — (verification)                                                                |

**Total: 19 tasks, 12 tables migrated, 2 old components deleted.**
