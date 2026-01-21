import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface FilterTriggerButtonProps {
  onClick: () => void;
  hasActiveFilters?: boolean;
  activeFilterCount?: number;
  className?: string;
}

export const FilterTriggerButton: React.FC<FilterTriggerButtonProps> = ({
  onClick,
  hasActiveFilters = false,
  activeFilterCount,
  className
}) => {
  return (
    <button
      className={cn(
        'relative flex items-center justify-center',
        'w-9 h-9',
        'bg-[var(--card)] border border-[var(--border)] rounded-md',
        'cursor-pointer text-[var(--muted-foreground)]',
        'transition-all duration-200',
        'hover:bg-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--primary)]',
        'active:scale-95',
        hasActiveFilters && [
          'bg-[var(--primary)] border-[var(--primary)] text-white',
          'hover:brightness-110 hover:text-white',
        ],
        className
      )}
      onClick={onClick}
      title="Search & Sort"
      aria-label="Open search and sort panel"
    >
      <SlidersHorizontal size={18} />
      {activeFilterCount !== undefined && activeFilterCount > 0 && (
        <span
          className={cn(
            'absolute -top-0.5 -right-0.5',
            'min-w-4 h-4 px-1',
            'bg-[var(--destructive)] text-white',
            'text-[10px] font-bold rounded-full',
            'flex items-center justify-center'
          )}
        >
          {activeFilterCount}
        </span>
      )}
    </button>
  );
};

export default FilterTriggerButton;
