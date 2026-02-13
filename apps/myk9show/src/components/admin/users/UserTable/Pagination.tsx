/**
 * Pagination - Apple-inspired pagination controls
 */

import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalUsers: number;
  searchTerm: string;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  pageSize,
  totalUsers,
  searchTerm,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  const paginationButtonClass =
    'h-9 w-9 p-0 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 ease-apple';

  return (
    <div className="flex items-center justify-between pt-6 pb-2">
      {/* Results Summary */}
      <div className="flex items-center gap-3">
        <div className="text-sm text-muted-foreground font-[500]">
          Showing{' '}
          <span className="font-[590] text-foreground">
            {(currentPage - 1) * pageSize + 1}
          </span>{' '}
          to{' '}
          <span className="font-[590] text-foreground">
            {Math.min(currentPage * pageSize, totalUsers)}
          </span>{' '}
          of{' '}
          <span className="font-[590] text-foreground">{totalUsers}</span>{' '}
          users
        </div>
        {searchTerm && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-1 w-1 rounded-full bg-muted-foreground/60" />
            <Search className="h-3 w-3" />
            <span>filtered by &quot;{searchTerm}&quot;</span>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center gap-1">
        {/* First Page */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className={paginationButtonClass}
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        {/* Previous Page */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={paginationButtonClass}
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1 mx-2">
          {Array.from(
            { length: Math.min(5, totalPages) },
            (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              const isActive = currentPage === pageNum;

              return (
                <Button
                  key={pageNum}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  className={`w-9 h-9 p-0 rounded-xl font-[590] transition-all duration-300 ease-apple ${
                    isActive
                      ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md border-0 scale-105'
                      : 'border border-border/50 bg-background/50 backdrop-blur-sm'
                  }`}
                  onClick={() => onPageChange(pageNum)}
                  title={`Page ${pageNum}`}
                >
                  {pageNum}
                </Button>
              );
            }
          )}
        </div>

        {/* Next Page */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={paginationButtonClass}
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Last Page */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className={paginationButtonClass}
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
