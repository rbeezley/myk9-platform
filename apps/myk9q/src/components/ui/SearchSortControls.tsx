import React from 'react';
import { Search, X, ArrowUpDown, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * SearchSortControls Component - Migrated to Tailwind CSS
 *
 * Reusable search and sort controls component
 * Provides collapsible search input with clear button and sort options
 *
 * @example
 * <SearchSortControls
 *   searchTerm={searchTerm}
 *   onSearchChange={setSearchTerm}
 *   searchPlaceholder="Search classes..."
 *   sortOptions={[
 *     { value: 'class_order', label: 'Class Order' },
 *     { value: 'element_level', label: 'Element' }
 *   ]}
 *   sortOrder={sortOrder}
 *   onSortChange={setSortOrder}
 *   isCollapsed={isCollapsed}
 *   onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
 *   resultsLabel="10 of 25 classes"
 * />
 */

export interface SortOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface SearchSortControlsProps {
  /** Current search term */
  searchTerm: string;
  /** Search term change handler */
  onSearchChange: (term: string) => void;
  /** Placeholder text for search input */
  searchPlaceholder?: string;
  /** Available sort options */
  sortOptions?: SortOption[];
  /** Current sort order */
  sortOrder?: string;
  /** Sort order change handler */
  onSortChange?: (order: string) => void;
  /** Whether controls are collapsed */
  isCollapsed?: boolean;
  /** Toggle collapse state */
  onToggleCollapse?: () => void;
  /** Results count display (e.g., "10 of 25 classes") */
  resultsLabel?: string;
  /** Additional CSS class */
  className?: string;
}

export const SearchSortControls: React.FC<SearchSortControlsProps> = ({
  searchTerm,
  onSearchChange,
  searchPlaceholder = 'Search...',
  sortOptions = [],
  sortOrder,
  onSortChange,
  isCollapsed = false,
  onToggleCollapse,
  resultsLabel,
  className,
}) => {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Collapse Toggle Header */}
      {onToggleCollapse && (
        <div
          className={cn(
            'flex items-center gap-2',
            'px-2 py-1',
            isCollapsed && 'opacity-70'
          )}
        >
          <button
            className={cn(
              'p-2 rounded-lg',
              'bg-transparent border-none cursor-pointer',
              'text-[var(--muted-foreground)]',
              'hover:bg-[var(--muted)]',
              'transition-transform duration-200',
              !isCollapsed && 'rotate-180'
            )}
            onClick={onToggleCollapse}
            aria-label={
              isCollapsed
                ? 'Show search and sort options'
                : 'Hide search and sort options'
            }
            title={
              isCollapsed
                ? 'Show search and sort options'
                : 'Hide search and sort options'
            }
          >
            <ChevronDown className="h-4 w-4" />
          </button>

          <span className="text-sm text-[var(--muted-foreground)]">
            {searchTerm ? resultsLabel : 'Search & Sort'}
          </span>
        </div>
      )}

      {/* Search Results Summary */}
      {searchTerm && resultsLabel && (
        <div className="px-3 py-1.5 text-sm text-[var(--muted-foreground)]">
          {resultsLabel}
        </div>
      )}

      {/* Collapsible Container */}
      <div
        className={cn(
          'flex flex-col gap-3',
          'transition-all duration-200',
          isCollapsed && 'h-0 overflow-hidden opacity-0'
        )}
      >
        {/* Search Input */}
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-[18px] h-[18px] text-[var(--muted-foreground)] flex-shrink-0" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className={cn(
              'w-full',
              'pl-10 pr-10 py-3',
              'rounded-xl',
              'bg-[var(--muted)]/50',
              'border border-[var(--border)]',
              'text-[var(--foreground)]',
              'placeholder:text-[var(--muted-foreground)]',
              'text-sm',
              'min-h-[44px]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent',
              'transition-all duration-200'
            )}
          />
          {searchTerm && (
            <button
              className={cn(
                'absolute right-2',
                'p-2 rounded-full',
                'bg-transparent border-none cursor-pointer',
                'text-[var(--muted-foreground)]',
                'hover:text-[var(--foreground)] hover:bg-[var(--muted)]',
                'transition-colors duration-200'
              )}
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
            >
              <X className="w-4 h-4 flex-shrink-0" />
            </button>
          )}
        </div>

        {/* Sort Controls */}
        {sortOptions.length > 0 && onSortChange && (
          <div className="flex flex-wrap gap-2">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                className={cn(
                  'inline-flex items-center gap-1.5',
                  'px-3 py-2 rounded-lg',
                  'text-sm font-medium',
                  'border-none cursor-pointer',
                  'min-h-[36px]',
                  'transition-all duration-200',
                  sortOrder === option.value
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--muted)]/50 text-[var(--muted-foreground)] hover:bg-[var(--muted)]'
                )}
                onClick={() => onSortChange(option.value)}
              >
                {option.icon || (
                  <ArrowUpDown className="w-4 h-4 flex-shrink-0" />
                )}
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
