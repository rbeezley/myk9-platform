# DataTable Standard — Design Spec

> **Date:** 2026-03-25
> **Goal:** Replace all ad-hoc table implementations with a single, consistent `DataTable<TData>` component built on TanStack Table + shadcn `Table` primitives.

## Motivation

The codebase has 13+ table implementations using 4 different sorting strategies, inconsistent pagination (only `UserTable`), no shared selection model, and no standard toolbar. This creates visual inconsistency, duplicated logic, and slows down building new table views.

**Primary driver:** Visual and behavioral consistency across all tables.

## Approach

**TanStack Table (`@tanstack/react-table`)** — headless table library that handles sorting, filtering, pagination, selection, and column visibility. We render through existing shadcn `Table` primitives (`Table`, `TableRow`, `TableHead`, `TableCell`). No new styling system.

---

## Component Architecture

```
src/components/ui/data-table/
  index.tsx                    — main DataTable component
  data-table-toolbar.tsx       — composable toolbar (search, filters, actions, column toggle)
  data-table-pagination.tsx    — pagination controls
  data-table-column-header.tsx — sortable header with indicators
  data-table-editable-cell.tsx — generic editable cell wrapper
  types.ts                     — shared types (column meta, edit config, etc.)
```

### Usage Pattern

```typescript
import { DataTable } from '@/components/ui/data-table';

const columns: ColumnDef<TrialClass>[] = [
  { accessorKey: 'element', header: 'Element', sortingFn: 'text' },
  { accessorKey: 'level', header: 'Level', sortingFn: levelProgressionSort },
  { accessorKey: 'judge', header: 'Judge' },
  { accessorKey: 'entries', header: 'Entries', sortingFn: 'basic' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

<DataTable
  columns={columns}
  data={classes}
  pageSize={25}
  onRowClick={(row) => navigate(`/classes/${row.id}`)}
  toolbar={({ table }) => (
    <DataTableToolbar table={table}>
      <DataTableSearch placeholder="Search classes..." />
      <DataTableColumnToggle />
    </DataTableToolbar>
  )}
/>
```

**Key decisions:**

- Column definitions live alongside the view that uses them (not centralized)
- `DataTable` handles all TanStack Table wiring internally — consumers pass `columns`, `data`, and opt-in props
- Existing shadcn `Table` primitives render the markup

---

## Sorting

### Built-in Sort Types

TanStack Table provides: `text`, `alphanumeric`, `datetime`, `basic` (numeric). Specified per column.

### Custom Sort Functions

For domain-specific ordering like level progression, register custom sorting functions:

```typescript
// src/components/ui/data-table/sorting.ts
import { SortingFn } from '@tanstack/react-table';

const LEVEL_ORDER = ['Introductory', 'Novice', 'Intermediate', 'Senior', 'Master', 'Champion'];

export const levelProgressionSort: SortingFn<any> = (rowA, rowB, columnId) => {
  const a = LEVEL_ORDER.indexOf(rowA.getValue(columnId));
  const b = LEVEL_ORDER.indexOf(rowB.getValue(columnId));
  return a - b;
};
```

### Multi-Column Sort

- **Enabled by default** on all tables, max 3 sort columns
- **Click** a header → sorts by that column (replaces existing sort)
- **Shift+Click** → adds as secondary/tertiary sort
- **Visual indicator:** Small number badge next to sort arrow (e.g., `Element ↑¹` `Level ↑²`)
- Tables can opt out with `enableMultiSort={false}`

### Sort Cycling

Click header cycles: unsorted → asc → desc → unsorted.

Icons: ArrowUp / ArrowDown / ArrowUpDown (matching current SortableTable).

### Externally-Controlled Sort Order

Tables can pass pre-sorted data and disable client-side sorting (`manualSorting={true}`). This supports future run order features and drag-to-reorder via `@dnd-kit`.

---

## Pagination

- **Always on** — every table paginates
- **Default page size:** 25
- **Page size selector:** 10 / 25 / 50 / 100 (configurable via `pageSizeOptions`)
- **Override per table:** `<DataTable pageSize={50} />`
- **Controls:** First / Previous / Next / Last buttons with page indicator ("Page 2 of 5")
- **Position:** Below the table — row count on the left ("Showing 26–50 of 127 entries"), navigation on the right
- **With selection:** Row count changes to "3 of 127 selected"
- **Auto-hide:** When total rows ≤ `pageSize`, the pagination bar hides automatically. The table still paginates internally (consistent behavior), but the controls add no visual noise for small datasets.

---

## Row Selection

**Off by default.** Opt-in per table:

- `selectable="multi"` — Checkbox column, header checkbox for select-all, Shift+Click for range select
- `selectable="single"` — Radio-style, one row at a time

```typescript
<DataTable
  columns={columns}
  data={users}
  selectable="multi"
  onSelectionChange={(selectedRows) => setSelected(selectedRows)}
  toolbar={({ table }) => (
    <DataTableToolbar table={table}>
      <BulkActions selected={table.getSelectedRowModel().rows} />
    </DataTableToolbar>
  )}
/>
```

- Checkbox/radio column is auto-prepended (not defined in column array)
- **Select-all** selects current page only. A "Select all 127" link appears for cross-page selection.
- **Callback timing:** `onSelectionChange` fires on every state change with the full current selection array. Consumers should derive UI state (e.g., bulk action availability) from `selectedRows.length`, not individual entries.

---

## Column Visibility & Responsive Hiding

### User Toggle

`<DataTableColumnToggle />` renders a dropdown with checkboxes for each column. Columns can be marked `enableHiding: false` to prevent user hiding (e.g., primary name column).

### Responsive Auto-Hiding

Column definitions accept a `meta.responsiveHide` breakpoint:

```typescript
{
  accessorKey: 'date',
  header: 'Date',
  meta: { responsiveHide: 'md' },  // hidden below 768px
},
{
  accessorKey: 'breed',
  header: 'Breed',
  meta: { responsiveHide: 'lg' },  // hidden below 1024px
},
```

Uses Tailwind breakpoints. Applied as `hidden md:table-cell` on `<td>` and `<th>`. Pure CSS, no JS resize observer.

**Note:** `meta.responsiveHide` is a pure visual concern, independent of TanStack Table's column visibility state. A responsive-hidden column is still "visible" in TanStack Table's model, meaning global search will include it and `getVisibleFlatColumns()` will return it. The `DataTableColumnToggle` dropdown should reflect responsive state: on small screens, responsive-hidden columns appear as disabled/greyed with a "hidden on mobile" note, preventing user confusion.

### Persistence

Column visibility state resets on navigation. localStorage persistence can be added later as opt-in.

---

## Inline Editing

### Column-Level Opt-In

Each column specifies edit configuration via `meta`:

```typescript
{
  accessorKey: 'time',
  header: 'Time',
  meta: {
    editable: true,
    editType: 'text',       // 'text' | 'number' | 'select' | 'time' | 'custom'
    editOptions: [...],      // for select type
    validate: (value) => ..., // returns string error or null
  },
}
```

### Edit Interaction

- Click a cell to enter edit mode
- **Keyboard nav:** Tab → next editable cell, Shift+Tab → previous, Enter → confirm and move down, Escape → cancel
- Edited cells show a subtle left border accent (dirty indicator)

### Save Modes (table-level prop)

- `saveMode="auto"` — Debounced auto-save (default 2s) per-cell. Fires `onSave` after the cell's debounce timer expires.
- `saveMode="batch"` — Dirty changes accumulate, save bar appears at bottom with Save/Discard buttons. Fires `onSaveBatch` on save.

**Callback signatures:**

```typescript
// Row identity derived from getRowId prop, defaults to (row) => row.id
getRowId?: (row: TData) => string;

// Auto-save: fires per cell after debounce. Rejecting the promise reverts
// the cell value and shows a toast error.
onSave?: (rowId: string, columnId: string, value: unknown) => Promise<void>;

// Batch save: fires with all accumulated changes.
onSaveBatch?: (changes: Array<{
  rowId: string;
  columnId: string;
  oldValue: unknown;
  newValue: unknown;
}>) => Promise<void>;
```

### Validation

Errors display inline below the cell. Rows with validation errors get a red left border. Batch save is blocked until errors are resolved.

### Custom Cell Editors

For anything beyond built-in types, pass `editType: 'custom'` and an `editComponent`:

```typescript
interface EditComponentProps<TValue> {
  value: TValue;
  onChange: (value: TValue) => void;
  onCommit: () => void;   // confirm edit, triggers save and auto-advance
  onCancel: () => void;   // revert to original value
  row: Row<TData>;        // full row for context-dependent editors
  column: Column<TData>;  // column definition
}

// Usage in column def:
{
  accessorKey: 'special_field',
  meta: {
    editable: true,
    editType: 'custom',
    editComponent: (props: EditComponentProps<string>) => <MyCustomEditor {...props} />,
  },
}
```

---

## Scoring Mode

A specialized editing configuration for fast score entry from paper score sheets. Optimized for trial secretaries entering 30–40 entries per class.

### Activation

```typescript
<DataTable
  columns={scoringColumns}
  data={entries}
  saveMode="auto"
  scoringMode={{
    enabled: true,
    autoAdvance: true,
    conditionalFields: {
      reason: (row) => ['NQ', 'E'].includes(row.result),
    },
    progressIndicator: true,
  }}
/>
```

### Domain Hook Integration

Scoring mode is a **UI layer** — it controls field flow, keyboard navigation, and visual presentation. Domain-specific logic (data transformation, placement calculation, qualification-reason clearing, multi-area scent work results) remains in external hooks like `useClassResults`. The DataTable receives pre-transformed data and calls domain callbacks via `onSave`/`onSaveBatch`. It does not own business rules.

This means:

- `useClassResults` (or equivalent domain hook) transforms raw `ScentWorkEntry[]` into the row data shape the table displays
- Auto-placement recalculation on time/qualification/faults change is triggered by the domain hook's `onSave` handler, not the table
- `MultiAreaScentWorkResult` types with per-area fields are handled by custom cell editors (`editType: 'custom'`)
- `Ctrl+S` / `Cmd+S` is wired to the domain hook's submit function via the table's `onSaveBatch` callback

### Smart Entry Flow

1. **Scoring mode** — "Enter Scores" button strips the table to essential columns: Armband #, Dog Name (read-only), Time, Result, Faults, Reason.

2. **Auto-advance** — After entering time and pressing Enter/Tab, cursor moves to Result. After Result, if it requires a reason, cursor moves there. If not, it skips straight to the next row's Time field. Faults are always editable (you can fault and still qualify).

3. **Single-keystroke results** — Type `Q` for Qualify, `N` for NQ, `E` for Eliminated, `A` for Absent. Cell accepts the keystroke and resolves immediately. Numeric shortcuts also supported (`1`=Q, `2`=NQ, etc.).

4. **Conditional fields** — Reason column only becomes editable when result requires it (NQ, Eliminated). Faults column is always editable.

5. **Smart time input** — This replaces the existing `SimpleTimeFields` (three separate inputs) and `TimeCell` components with a single-field digit-stream input. Secretary types a continuous stream of digits. Formatting is applied on blur/Tab. When editing an existing time (e.g., `1:23.45`), clicking the cell shows the raw digits (`12345`) for easy correction.

   | Typed    | Formatted  | Explanation                             |
   | -------- | ---------- | --------------------------------------- |
   | `4532`   | `0:45.32`  | 4 digits → 0 min, 45 sec, 32 hundredths |
   | `12345`  | `1:23.45`  | 5 digits → 1 min, 23 sec, 45 hundredths |
   | `100032` | `10:00.32` | 6 digits → 10 min, 0 sec, 32 hundredths |
   | `532`    | `0:05.32`  | 3 digits → 0 min, 5 sec, 32 hundredths  |
   | `32`     | `0:00.32`  | 2 digits → just hundredths              |

   **Rule:** Last 2 digits = hundredths. Next 2 = seconds (max 59). Remainder = minutes. No leading zeros required. Handles everything from quick indications to 10-minute detective searches.

6. **Visual progress** — Progress bar or counter ("12 of 38 scored") at the top. Unscored rows have a faint highlight. Scored rows show a green check.

7. **Error prevention** — Times outside a reasonable range for the class show an inline warning but don't block entry. Secretary knows best.

8. **Undo** — Ctrl+Z undoes the last cell edit and moves cursor back.

### Future: Run Order

Run order (manual drag-to-reorder, ascending/descending armband sort, and other strategies from myK9Q) is a separate feature. The DataTable design is compatible with `@dnd-kit` and supports externally-controlled sort order (`manualSorting`) to accommodate this.

---

## Toolbar

Composable slot — assemble from standard building blocks:

```typescript
<DataTable
  columns={columns}
  data={entries}
  toolbar={({ table }) => (
    <DataTableToolbar table={table}>
      <DataTableSearch placeholder="Search entries..." />
      <DataTableFilter column="status" options={['Pending', 'Scored', 'Absent']} />
      <DataTableFilter column="element" options={elements} />
      <DataTableColumnToggle />
      <Button onClick={handleExport}>Export</Button>
    </DataTableToolbar>
  )}
/>
```

### Layout

- Left-aligned: search, filters
- Right-aligned: actions, column toggle, buttons
- Mobile: search goes full width, filters collapse into a "Filters" dropdown

### Components

- **DataTableSearch** — Debounced text input (300ms). Uses TanStack Table's `globalFilter` with an `includesString` filter function. Searches all columns with `enableGlobalFilter !== false` (this intentionally includes responsive-hidden columns — if data matches, the row should appear). Scope to specific columns via `searchColumns={['dogName', 'handler']}`.
- **DataTableFilter** — Dropdown button with column name. Active filter shown as badge count. Single or multi-select. Clears with X.
- **DataTableColumnToggle** — Column visibility dropdown.

### No Toolbar by Default

If `toolbar` prop is not passed, the table renders without one.

---

## Empty States & Loading

### Loading

Skeleton rows matching column layout. Row count matches `pageSize` (or 5 on first load). Toolbar remains interactive.

```typescript
<DataTable columns={columns} data={entries} loading={isLoading} />
```

### Empty State

Default: "No results found." centered in table body. Customizable:

```typescript
<DataTable
  columns={columns}
  data={[]}
  emptyState={
    <div className="text-center py-8">
      <p className="text-muted-foreground">No entries for this class yet.</p>
      <Button onClick={addEntry} className="mt-2">Add Entry</Button>
    </div>
  }
/>
```

### Filtered Empty

When `data.length > 0` but filters produce zero visible rows: "No results match your filters." with a "Clear filters" button. Distinguished automatically.

---

## Row Click & Navigation

### Row Click

Opt-in via `onRowClick`. Adds `cursor-pointer` and hover emphasis. The callback receives the original data object and the TanStack `Row` wrapper:

```typescript
// onRowClick?: (data: TData, row: Row<TData>) => void
<DataTable
  columns={columns}
  data={classes}
  onRowClick={(data) => navigate(`/classes/${data.id}`)}
/>
```

### Interaction Conflict Resolution

When rows are clickable AND have editing/selection:

- Click checkbox → toggles selection, no row click
- Click editable cell → enters edit mode, no row click
- Click non-editable, non-interactive cell → triggers row click

### Row Actions Column

For per-row actions, define an actions column with a dropdown:

```typescript
{
  id: 'actions',
  cell: ({ row }) => (
    <DropdownMenu>
      <DropdownMenuItem onClick={() => handleEdit(row.original)}>Edit</DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleDelete(row.original)}>Delete</DropdownMenuItem>
    </DropdownMenu>
  ),
  enableSorting: false,
  enableHiding: false,
}
```

Clicking the actions dropdown does NOT trigger row click.

---

## Migration Strategy

### Tables to Migrate (12 table components)

| Table                       | Current Pattern                                      | Complexity |
| --------------------------- | ---------------------------------------------------- | ---------- |
| ClassesTableView            | SortableTable                                        | Low        |
| EntriesTableView            | SortableTable                                        | Low        |
| ShowsTableView              | SortableTable                                        | Low        |
| DataTable (base/) consumers | Simple DataTable                                     | Low        |
| DogsTableView               | Inline sort state                                    | Medium     |
| PeopleTableView             | Inline sort state                                    | Medium     |
| TrialClassesTable           | Custom sort + search                                 | Medium     |
| TrialEntriesTable           | Custom sort + search + React Query                   | Medium     |
| UserTable                   | Custom pagination + selection + density              | Medium     |
| ClassEntriesTable           | Custom inline editing                                | High       |
| ClassResultsTable           | Custom inline editing + domain scoring logic         | High       |
| ClassDefinitionTable        | Selection + drag-reorder + inline edit + bulk delete | High       |

### Migration Order

1. **Phase 1 — Low complexity** — SortableTable consumers (ClassesTableView, EntriesTableView, ShowsTableView) + base DataTable consumers. Proves the pattern.
2. **Phase 2 — Medium complexity** — Tables with custom sort/search (DogsTableView, PeopleTableView, TrialClassesTable, TrialEntriesTable, UserTable).
3. **Phase 3 — High complexity** — ClassEntriesTable, ClassResultsTable, and ClassDefinitionTable. ClassDefinitionTable has drag-to-reorder via `@dnd-kit`, multi-select with checkboxes, inline display-order editing, bulk delete, and row duplication — making it comparable in complexity to the scoring tables.

### What Gets Deleted After Migration

- `src/components/common/SortableTable.tsx`
- `src/components/base/DataTable.tsx`
- Custom sort logic scattered across individual table views

### What Stays

- `src/components/ui/table/table.tsx` — shadcn primitives (DataTable renders through them)

---

## Accessibility

TanStack Table is headless and provides no ARIA attributes — these must be implemented in the DataTable component:

- **Sort headers:** `aria-sort="ascending"` / `"descending"` / `"none"` on `<th>` elements
- **Pagination:** Buttons get `aria-label` (e.g., "Go to next page", "Page 2 of 5")
- **Selection:** Checkboxes get `aria-label` (e.g., "Select row", "Select all rows on this page")
- **Editable cells:** Announce edit mode to screen readers via `aria-label` changes when entering/exiting edit mode
- **Focus management:** When pagination changes, focus moves to the first row of the new page. When inline editing commits, focus moves to the next editable cell per auto-advance rules.
- **Keyboard navigation:** Arrow keys navigate between rows (non-editing mode), Enter activates row click or enters edit mode

---

## Testing

Each phase of migration requires:

- Unit tests for the new `DataTable` component (sorting, pagination, selection, column visibility, responsive hiding)
- Unit tests for scoring mode (auto-advance, time formatting, single-keystroke results, conditional fields)
- Migration tests verifying each converted table view renders correctly with the same data
- Keyboard navigation tests for inline editing and scoring mode
