/**
 * Pagination controls for any client-paginated list.
 *
 * Wraps at narrow widths and treats "no results" as page 1 of 1, so the Next
 * and Last buttons can never walk the caller to page 0.
 *
 * Fully controlled: the caller owns the page index and the slicing. Promoted
 * out of the admin user table when the /dogs card view needed the same
 * contract (MYK9-218) — one pagination control, not one per surface.
 */

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface ListPaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  /** Size of the WHOLE filtered set, not of the current page. */
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** Accessible name for the nav landmark, e.g. "Dog list pagination". */
  label: string;
  /** Noun for the page-size control's label, e.g. "Rows" or "Cards". */
  pageSizeLabel?: string;
  /** Unique id for the page-size select, required only when it is rendered. */
  pageSizeInputId?: string;
}

export const ListPagination: React.FC<ListPaginationProps> = ({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  label,
  pageSizeLabel = 'Rows',
  pageSizeInputId = 'list-page-size',
}) => {
  // An empty result set still has one (empty) page. Without this floor,
  // `currentPage === totalPages` is `1 === 0`, which leaves Next/Last enabled
  // and lets the caller be paged to 0.
  const lastPage = Math.max(1, totalPages);
  const page = Math.min(Math.max(1, currentPage), lastPage);

  if (lastPage <= 1 && !onPageSizeChange) return null;

  const navButtonClass = 'h-11 w-11 p-0 rounded-xl border border-border bg-background';

  const firstShown = totalItems === 0 ? 0 : Math.min((page - 1) * pageSize + 1, totalItems);
  const lastShown = Math.min(page * pageSize, totalItems);

  const pageNumbers = Array.from({ length: Math.min(5, lastPage) }, (_, i) => {
    if (lastPage <= 5 || page <= 3) return i + 1;
    if (page >= lastPage - 2) return lastPage - 4 + i;
    return page - 2 + i;
  });

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-4 pt-6 pb-2"
    >
      {/* Results summary & page size */}
      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <label htmlFor={pageSizeInputId}>{pageSizeLabel}</label>
            <select
              id={pageSizeInputId}
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              className="h-11 px-3 rounded-lg border border-border bg-background text-foreground
                         text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{firstShown}</span> to{' '}
          <span className="font-semibold text-foreground">{lastShown}</span> of{' '}
          <span className="font-semibold text-foreground">{totalItems}</span>
        </p>
      </div>

      {/* Pagination controls */}
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="outline"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className={navButtonClass}
          aria-label="Go to first page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={navButtonClass}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1 mx-2">
          {pageNumbers.map(pageNum => {
            const isActive = page === pageNum;
            return (
              <Button
                key={pageNum}
                variant={isActive ? 'default' : 'outline'}
                className={`h-11 w-11 p-0 rounded-xl font-semibold ${
                  isActive ? '' : 'border border-border bg-background'
                }`}
                onClick={() => onPageChange(pageNum)}
                aria-label={`Go to page ${pageNum}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>

        <Button
          variant="outline"
          onClick={() => onPageChange(page + 1)}
          disabled={page === lastPage}
          className={navButtonClass}
          aria-label="Go to next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          onClick={() => onPageChange(lastPage)}
          disabled={page === lastPage}
          className={navButtonClass}
          aria-label="Go to last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
};
