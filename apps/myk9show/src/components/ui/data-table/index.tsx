/* eslint-disable react-refresh/only-export-components */
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import {
  type ColumnDef,
  type DisplayColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
  type Table as TanstackTable,
  type Column,
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
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
import { type DataTableColumnMeta, getColumnLayoutClasses } from './types';
import { DataTableToolbar } from './data-table-toolbar';
import { DataTableSearch } from './data-table-search';
import { DataTableColumnToggle } from './data-table-column-toggle';
import { Button } from '@/components/ui/button';
import { Download, RotateCcw, Rows3 } from 'lucide-react';

export type { ColumnDef } from '@tanstack/react-table';
export { DataTableColumnHeader } from './data-table-column-header';
export { DataTablePagination } from './data-table-pagination';
export { levelProgressionSort, formatSearchTime, parseSearchTimeDigits } from './sorting';
export type {
  DataTableColumnMeta,
  EditComponentProps,
  CellChange,
  ScoringModeConfig,
} from './types';
export { DataTableToolbar, useDataTableContext } from './data-table-toolbar';
export { DataTableSearch } from './data-table-search';
export { DataTableColumnToggle } from './data-table-column-toggle';
export { EditableCell } from './data-table-editable-cell';
export type { EditableCellProps } from './data-table-editable-cell';
export { TimeInput } from './data-table-time-input';
export type { TimeInputProps } from './data-table-time-input';
export { useScoringMode, ScoringProgress } from './data-table-scoring-mode';
export type { UseScoringModeProps, UseScoringModeReturn } from './data-table-scoring-mode';

interface DataTableProps<TData> {
  tableId?: string;
  /** Accessible name for the keyboard-focusable horizontal scroll area. */
  scrollAreaLabel?: string;
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pageSize?: number;
  pageSizeOptions?: number[];
  enableMultiSort?: boolean;
  initialSorting?: SortingState;
  onRowClick?: (data: TData, row: unknown) => void;
  selectable?: 'single' | 'multi';
  onSelectionChange?: (selectedRows: TData[]) => void;
  getRowId?: (row: TData) => string;
  toolbar?: (props: { table: TanstackTable<TData> }) => ReactNode;
  /**
   * Whether the default toolbar renders its built-in global-filter search box.
   * Defaults to `true`. Set to `false` when an outer toolbar (e.g. the page's
   * `ListControls`) already owns search, so the table contributes only its
   * "Columns" visibility control instead of a second, redundant search.
   * Ignored when a custom `toolbar` is supplied.
   */
  showSearch?: boolean;
  /**
   * Whether the default toolbar renders its built-in "Export CSV" button.
   * Defaults to `true`. Set to `false` when the page owns export — the built-in
   * one exports the rows the table was handed, which is only the current page
   * on a surface that paginates outside the table, so two exports side by side
   * silently disagree about scope.
   */
  showExport?: boolean;
  emptyState?: ReactNode;
  noResultsMessage?: ReactNode;
  loading?: boolean;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  manualSorting?: boolean;
  /**
   * Controlled sorting. Pass alongside `manualSorting` when the caller sorts
   * the data itself — a table that only holds one page of rows can only sort
   * that page, which misreports any sort on a multi-page list.
   */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  className?: string;
  getRowClassName?: (data: TData) => string;
  /**
   * Controlled density (operational-views-and-display-presets, Design
   * Decision 3). When provided, overrides the table's own per-`tableId`
   * localStorage density and hides the built-in toggle — the caller (a
   * surface-level `DensityControl`) owns density instead, so there is one
   * density control per surface, not two.
   */
  density?: TableDensity;
}

export type TableDensity = 'comfortable' | 'compact';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function readStoredPageSize(
  tableId: string | undefined,
  fallback: number,
  options: readonly number[]
): number {
  if (!tableId) return fallback;
  try {
    const stored = localStorage.getItem(`datatable-page-size-${tableId}`);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) && options.includes(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readStoredDensity(tableId: string | undefined): TableDensity {
  if (!tableId) return 'comfortable';
  try {
    return localStorage.getItem(`datatable-density-${tableId}`) === 'compact'
      ? 'compact'
      : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

function writeStorageValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference persistence is non-critical.
  }
}

function escapeCsvValue(value: unknown): string {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function getExportColumnLabel<TData>(column: Column<TData, unknown>): string {
  const columnDef = column.columnDef as ColumnDef<TData, unknown>;
  const meta = columnDef.meta as DataTableColumnMeta | undefined;
  if (meta?.exportHeader) return meta.exportHeader;
  if (typeof columnDef.header === 'string') return columnDef.header;
  return column.id;
}

function exportTableCsv<TData>(table: TanstackTable<TData>, tableId: string) {
  const columns = table.getVisibleLeafColumns().filter(column => {
    const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
    return column.id !== '_select' && !meta?.exportDisabled;
  });
  const rows = table.getFilteredRowModel().rows;

  const header = columns.map(column => escapeCsvValue(getExportColumnLabel(column))).join(',');
  const body = rows.map(row =>
    columns
      .map(column => {
        const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
        const value = meta?.exportValue ? meta.exportValue(row.original) : row.getValue(column.id);
        return escapeCsvValue(value);
      })
      .join(',')
  );
  const csv = [header, ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${tableId}-${new Date().toISOString().slice(0, 10)}.csv`;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function isInteractiveElement(target: EventTarget | null, boundary: Element): boolean {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest(
    'a,button,input,select,textarea,[role="button"],[role="menuitem"],[tabindex]:not([tabindex="-1"])'
  );
  // The match must be INSIDE the row. `closest` walks the whole ancestor chain,
  // so without this a table nested in the standard `role="region" tabIndex={0}`
  // scroll wrapper matched that wrapper on every click and swallowed the row
  // handler entirely — /admin/users shipped that way.
  return Boolean(interactive && interactive !== boundary && boundary.contains(interactive));
}

export function DataTable<TData>({
  tableId,
  scrollAreaLabel,
  columns,
  data,
  pageSize = 25,
  pageSizeOptions,
  enableMultiSort = true,
  initialSorting,
  onRowClick,
  selectable,
  onSelectionChange,
  getRowId = (row: TData) => {
    const id = (row as Record<string, unknown>).id;
    if (id == null && import.meta.env.DEV) {
      console.warn('DataTable: Row has no `id` property. Provide a `getRowId` prop.');
    }
    return String(id ?? '');
  },
  toolbar,
  showSearch = true,
  showExport = true,
  emptyState,
  noResultsMessage,
  loading = false,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange,
  manualSorting = false,
  sorting: controlledSorting,
  onSortingChange,
  className,
  getRowClassName,
  density: controlledDensity,
}: DataTableProps<TData>) {
  const resolvedPageSizeOptions = pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS;
  const [internalSorting, setInternalSorting] = useState<SortingState>(initialSorting ?? []);
  const sorting = controlledSorting ?? internalSorting;
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useColumnVisibility(tableId);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: readStoredPageSize(tableId, pageSize, resolvedPageSizeOptions),
  });
  const [internalDensity, setInternalDensity] = useState<TableDensity>(() =>
    readStoredDensity(tableId)
  );
  const density = controlledDensity ?? internalDensity;
  const [internalGlobalFilter, setInternalGlobalFilter] = useState('');

  const globalFilterValue = controlledGlobalFilter ?? internalGlobalFilter;
  const setGlobalFilterValue = onGlobalFilterChange ?? setInternalGlobalFilter;

  useEffect(() => {
    if (!tableId) return;
    writeStorageValue(`datatable-page-size-${tableId}`, String(pagination.pageSize));
  }, [pagination.pageSize, tableId]);

  useEffect(() => {
    if (!tableId || controlledDensity) return;
    writeStorageValue(`datatable-density-${tableId}`, internalDensity);
  }, [internalDensity, tableId, controlledDensity]);

  // Prepend selection column if selectable
  const allColumns = useMemo(() => {
    if (!selectable) return columns;

    const selectionColumn: DisplayColumnDef<TData, unknown> = {
      id: '_select',
      meta: { interactive: true },
      header:
        selectable === 'multi'
          ? ({ table: tbl }) => (
              <input
                type="checkbox"
                checked={tbl.getIsAllPageRowsSelected()}
                onChange={tbl.getToggleAllPageRowsSelectedHandler()}
                aria-label="Select all rows on this page"
              />
            )
          : () => null,
      cell: ({ row }) => (
        <input
          type={selectable === 'multi' ? 'checkbox' : 'radio'}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={e => e.stopPropagation()}
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
    enableSortingRemoval: true,
    enableRowSelection: !!selectable,
    enableMultiRowSelection: selectable === 'multi',
    manualSorting,
    getRowId,
    onPaginationChange: setPagination,
    onSortingChange: updater => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (!controlledSorting) setInternalSorting(next);
      onSortingChange?.(next);
    },
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: updater => {
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater;
      setColumnVisibility(next);
    },
    onRowSelectionChange: updater => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(next);
      if (onSelectionChange) {
        const selectedRows = Object.keys(next)
          .filter(key => next[key])
          .map(key => {
            const row = table.getRow(key);
            return row.original;
          });
        onSelectionChange(selectedRows);
      }
    },
    onGlobalFilterChange: setGlobalFilterValue,
    getCoreRowModel: getCoreRowModel(),
    ...(manualSorting ? {} : { getSortedRowModel: getSortedRowModel() }),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
  });

  const getLayoutClass = (columnId: string, cell: 'header' | 'body') => {
    const colDef = allColumns.find(
      c => ('accessorKey' in c && c.accessorKey === columnId) || c.id === columnId
    );
    return getColumnLayoutClasses(colDef?.meta as DataTableColumnMeta | undefined, cell);
  };

  const resetTableView = () => {
    const resetSorting = initialSorting ?? [];
    if (!controlledSorting) setInternalSorting(resetSorting);
    onSortingChange?.(resetSorting);
    setColumnFilters([]);
    setColumnVisibility({});
    setRowSelection({});
    setGlobalFilterValue('');
    setPagination({ pageIndex: 0, pageSize });
    if (!controlledDensity) setInternalDensity('comfortable');
  };

  const headerCellClassName = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';
  const bodyCellClassName = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div
      data-datatable
      className={cn('overflow-hidden rounded-xl border border-border/50 bg-card', className)}
    >
      {toolbar
        ? toolbar({ table })
        : tableId && (
            <DataTableToolbar table={table}>
              {showSearch && <DataTableSearch />}
              <DataTableColumnToggle />
              {showExport && (
                <Button
                  variant="outline"
                  className="h-11 text-xs"
                  onClick={() => exportTableCsv(table, tableId)}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export CSV
                </Button>
              )}
              {!controlledDensity && (
                <Button
                  variant="outline"
                  className="h-11 text-xs"
                  onClick={() =>
                    setInternalDensity(internalDensity === 'compact' ? 'comfortable' : 'compact')
                  }
                  aria-pressed={density === 'compact'}
                >
                  <Rows3 className="h-3.5 w-3.5 mr-1" />
                  {density === 'compact' ? 'Comfortable density' : 'Compact density'}
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-11 text-xs"
                onClick={resetTableView}
                aria-label="Reset table view"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset view
              </Button>
            </DataTableToolbar>
          )}

      {/* Table component has its own overflow-auto wrapper */}
      <Table {...(scrollAreaLabel ? { scrollAreaLabel } : {})}>
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id} className="border-b border-border/50 bg-muted/30">
              {headerGroup.headers.map(header => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'text-left font-medium text-muted-foreground',
                    headerCellClassName,
                    getLayoutClass(header.column.id, 'header')
                  )}
                  aria-sort={
                    header.column.getIsSorted() === 'asc'
                      ? 'ascending'
                      : header.column.getIsSorted() === 'desc'
                        ? 'descending'
                        : undefined
                  }
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <DataTableColumnHeader
                      column={header.column}
                      title={
                        typeof header.column.columnDef.header === 'string'
                          ? header.column.columnDef.header
                          : header.column.id
                      }
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
                {data.length > 0
                  ? (noResultsMessage ?? (
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
                    ))
                  : (emptyState ?? 'No results found.')}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map(row => {
              const rowHasInteractiveCells = row.getVisibleCells().some(cell => {
                const meta = cell.column.columnDef.meta as DataTableColumnMeta | undefined;
                return meta?.interactive === true;
              });
              const keyboardRowClickProps =
                onRowClick && !rowHasInteractiveCells
                  ? {
                      tabIndex: 0,
                      role: 'button' as const,
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row.original, row);
                        }
                      },
                    }
                  : {};
              return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(
                    // `group/row` is what lets a left-pinned cell mirror this
                    // row's hover and selected tints (see STICKY_LEFT_BODY_CLASSES).
                    'group/row border-b border-border/30 hover:bg-muted/20 transition-colors',
                    onRowClick && 'cursor-pointer',
                    getRowClassName?.(row.original)
                  )}
                  onClick={event => {
                    if (isInteractiveElement(event.target, event.currentTarget)) return;
                    onRowClick?.(row.original, row);
                  }}
                  {...keyboardRowClickProps}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell
                      key={cell.id}
                      className={cn(bodyCellClassName, getLayoutClass(cell.column.id, 'body'))}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <DataTablePagination table={table} pageSizeOptions={resolvedPageSizeOptions} />
    </div>
  );
}
