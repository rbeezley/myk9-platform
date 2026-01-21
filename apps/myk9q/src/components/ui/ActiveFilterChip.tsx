import React from 'react';
import { X, Search } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ActiveFilterChipProps {
  /** The search term being displayed */
  searchTerm: string;
  /** Number of matching results */
  matchCount?: number;
  /** Total number of items */
  totalCount?: number;
  /** Callback when clear button is clicked */
  onClear: () => void;
  /** Optional className for additional styling */
  className?: string;
}

/**
 * A chip/banner that shows the active search filter with a clear button.
 * Displayed when a search filter is active, allows one-tap clearing.
 */
export const ActiveFilterChip: React.FC<ActiveFilterChipProps> = ({
  searchTerm,
  matchCount,
  totalCount,
  onClear,
  className,
}) => {
  if (!searchTerm) return null;

  const hasCountInfo = matchCount !== undefined && totalCount !== undefined;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2',
        'px-3 py-1.5',
        'bg-[var(--primary)]/10 border border-[var(--primary)]/30',
        'rounded-md text-sm text-[var(--primary)]',
        'max-w-full',
        className
      )}
    >
      <Search size={14} className="flex-shrink-0 opacity-70" />
      <span className="font-medium overflow-hidden text-ellipsis whitespace-nowrap">
        "{searchTerm}"
      </span>
      {hasCountInfo && (
        <span className="text-[var(--primary)]/70 text-xs">
          {matchCount} of {totalCount}
        </span>
      )}
      <button
        className={cn(
          'flex items-center justify-center',
          'w-5 h-5 p-0',
          'bg-[var(--primary)]/20 border-none rounded-full',
          'text-[var(--primary)]',
          'cursor-pointer transition-all duration-150',
          'hover:bg-[var(--primary)]/30',
          'active:bg-[var(--primary)]/40'
        )}
        onClick={onClear}
        aria-label="Clear search filter"
        title="Clear search"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default ActiveFilterChip;
