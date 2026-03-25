import { type ReactNode, useMemo, useState } from 'react';
import {
  type ColumnDef,
  type DisplayColumnDef,
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
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pageSize?: number;
  pageSizeOptions?: number[];
  enableMultiSort?: boolean;
  onRowClick?: (data: TData, row: unknown) => void;
  selectable?: 'single' | 'multi';
  onSelectionChange?: (selectedRows: TData[]) => void;
  getRowId?: (row: TData) => string;
  toolbar?: (props: { table: TanstackTable<TData> }) => ReactNode;
  emptyState?: ReactNode;
  noResultsMessage?: ReactNode;
  loading?: boolean;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  manualSorting?: boolean;
  className?: string;
  getRowClassName?: (data: TData) => string;
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
  noResultsMessage,
  loading = false,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange,
  manualSorting = false,
  className,
  getRowClassName,
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
    onColumnVisibilityChange: setColumnVisibility,
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

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-card/95 backdrop-blur-sm overflow-hidden',
        className
      )}
    >
      {toolbar?.({ table })}

      {/* Table component has its own overflow-auto wrapper */}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id} className="border-b border-border/50 bg-muted/30">
              {headerGroup.headers.map(header => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'px-4 py-3 text-left font-medium text-muted-foreground',
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
              >
                {row.getVisibleCells().map(cell => (
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

      <DataTablePagination
        table={table}
        {...(pageSizeOptions !== undefined ? { pageSizeOptions } : {})}
      />
    </div>
  );
}
