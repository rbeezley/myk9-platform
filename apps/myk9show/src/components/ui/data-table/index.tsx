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
import { type DataTableColumnMeta, RESPONSIVE_CLASSES } from './types';
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
export { DataTableFilter } from './data-table-filter';
export { DataTableColumnToggle } from './data-table-column-toggle';
export { EditableCell } from './data-table-editable-cell';
export type { EditableCellProps } from './data-table-editable-cell';
export { TimeInput } from './data-table-time-input';
export type { TimeInputProps } from './data-table-time-input';
export { useScoringMode, ScoringProgress } from './data-table-scoring-mode';
export type { UseScoringModeProps, UseScoringModeReturn } from './data-table-scoring-mode';

interface DataTableProps<TData> {
  tableId?: string;
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
  emptyState?: ReactNode;
  noResultsMessage?: ReactNode;
  loading?: boolean;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  manualSorting?: boolean;
  className?: string;
  getRowClassName?: (data: TData) => string;
}

type TableDensity = 'comfortable' | 'compact';

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
  const columns = table
    .getVisibleLeafColumns()
    .filter(column => {
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
  link.click();
  URL.revokeObjectURL(url);
}

export function DataTable<TData>({
  tableId,
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
  emptyState,
  noResultsMessage,
  loading = false,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange,
  manualSorting = false,
  className,
  getRowClassName,
}: DataTableProps<TData>) {
  const resolvedPageSizeOptions = pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS;
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useColumnVisibility(tableId);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: readStoredPageSize(tableId, pageSize, resolvedPageSizeOptions),
  });
  const [density, setDensity] = useState<TableDensity>(() => readStoredDensity(tableId));
  const [internalGlobalFilter, setInternalGlobalFilter] = useState('');

  const globalFilterValue = controlledGlobalFilter ?? internalGlobalFilter;
  const setGlobalFilterValue = onGlobalFilterChange ?? setInternalGlobalFilter;

  useEffect(() => {
    if (!tableId) return;
    writeStorageValue(`datatable-page-size-${tableId}`, String(pagination.pageSize));
  }, [pagination.pageSize, tableId]);

  useEffect(() => {
    if (!tableId) return;
    writeStorageValue(`datatable-density-${tableId}`, density);
  }, [density, tableId]);

  // Prepend selection column if selectable
  const allColumns = useMemo(() => {
    if (!selectable) return columns;

    const selectionColumn: DisplayColumnDef<TData, unknown> = {
      id: '_select',
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
    onSortingChange: setSorting,
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

  const getResponsiveClass = (columnId: string) => {
    const colDef = allColumns.find(
      c => ('accessorKey' in c && c.accessorKey === columnId) || c.id === columnId
    );
    const meta = colDef?.meta as DataTableColumnMeta | undefined;
    if (meta?.responsiveHide) {
      return RESPONSIVE_CLASSES[meta.responsiveHide];
    }
    return '';
  };

  const resetTableView = () => {
    setSorting(initialSorting ?? []);
    setColumnFilters([]);
    setColumnVisibility({});
    setRowSelection({});
    setGlobalFilterValue('');
    setPagination({ pageIndex: 0, pageSize });
    setDensity('comfortable');
  };

  const headerCellClassName = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';
  const bodyCellClassName = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div
      data-datatable
      className={cn(
        'rounded-xl border border-border/50 bg-card/95 backdrop-blur-sm overflow-hidden',
        className
      )}
    >
      {toolbar
        ? toolbar({ table })
        : tableId && (
            <DataTableToolbar table={table}>
              {showSearch && <DataTableSearch />}
              <DataTableColumnToggle />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => exportTableCsv(table, tableId)}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
                aria-pressed={density === 'compact'}
              >
                <Rows3 className="h-3.5 w-3.5 mr-1" />
                {density === 'compact' ? 'Comfortable density' : 'Compact density'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={resetTableView}
                aria-label="Reset table view"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset view
              </Button>
            </DataTableToolbar>
          )}

      {/* Table component has its own overflow-auto wrapper */}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id} className="border-b border-border/50 bg-muted/30">
              {headerGroup.headers.map(header => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'text-left font-medium text-muted-foreground',
                    headerCellClassName,
                    getResponsiveClass(header.column.id)
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
            table.getRowModel().rows.map(row => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={cn(
                  'border-b border-border/30 hover:bg-muted/20 transition-colors',
                  onRowClick && 'cursor-pointer',
                  getRowClassName?.(row.original)
                )}
                onClick={() => onRowClick?.(row.original, row)}
                {...(onRowClick
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
                  : {})}
              >
                {row.getVisibleCells().map(cell => (
                  <TableCell
                    key={cell.id}
                    className={cn(bodyCellClassName, getResponsiveClass(cell.column.id))}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <DataTablePagination
        table={table}
        pageSizeOptions={resolvedPageSizeOptions}
      />
    </div>
  );
}
