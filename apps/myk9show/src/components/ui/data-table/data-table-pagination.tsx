import { type Table } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

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
          <span>
            {selectedCount} of {totalRows} selected
          </span>
        ) : (
          <span>
            Showing {from}–{to} of {totalRows} entries
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={pageSize}
          onChange={e => table.setPageSize(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {pageSizeOptions.map(size => (
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
