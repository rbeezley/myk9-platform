import React, { useEffect, useRef } from 'react';
import { X, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SortOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Search
  searchTerm: string;
  onSearchChange: (term: string) => void;
  searchPlaceholder?: string;
  // Sort
  sortOptions: SortOption[];
  sortOrder: string;
  onSortChange: (order: string) => void;
  // Results info
  resultsLabel?: string;
  // Optional title
  title?: string;
  // Optional custom content (e.g., action buttons)
  children?: React.ReactNode;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  isOpen,
  onClose,
  searchTerm,
  onSearchChange,
  searchPlaceholder = 'Search...',
  sortOptions,
  sortOrder,
  onSortChange,
  resultsLabel,
  title = 'Search & Sort',
  children
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to allow animation to start
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleClearSearch = () => {
    onSearchChange('');
    inputRef.current?.focus();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 z-[9998]',
          'animate-[filterFadeIn_0.2s_ease-out]'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className={cn(
          'fixed top-0 right-0 h-screen',
          'w-[75vw] max-w-[360px]',
          'bg-[var(--background)]',
          'shadow-[-4px_0_20px_rgba(0,0,0,0.15)]',
          'dark:shadow-[-4px_0_20px_rgba(0,0,0,0.4)]',
          'z-[9999]',
          'flex flex-col overflow-hidden',
          'animate-[filterSlideIn_0.3s_ease-out]',
          'min-[641px]:max-[1024px]:w-[50vw] min-[641px]:max-[1024px]:max-w-[400px]',
          'min-[1025px]:w-[320px]'
        )}
        role="complementary"
        aria-label={title}
      >
        {/* Header */}
        <div
          className={cn(
            'flex justify-between items-center',
            'px-6 py-5',
            'border-b border-[var(--border)]',
            'bg-[var(--card)]',
            'flex-shrink-0',
            'max-[480px]:px-4 max-[480px]:py-4'
          )}
        >
          <div className="flex items-center gap-3">
            <SlidersHorizontal size={20} className="text-[var(--primary)]" />
            <h2 className="text-lg font-semibold m-0 text-[var(--foreground)]">{title}</h2>
          </div>
          <button
            className={cn(
              'bg-transparent border-none p-3',
              'cursor-pointer text-[var(--muted-foreground)] rounded-md',
              'flex items-center justify-center',
              'transition-all duration-200',
              'hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
              'active:scale-95'
            )}
            onClick={onClose}
            title="Close"
            aria-label="Close filter panel"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div
          className={cn(
            'flex-1 overflow-y-auto',
            'px-6 py-5 flex flex-col gap-5',
            'max-[480px]:px-4 max-[480px]:py-4'
          )}
        >
          {/* Results Label */}
          {resultsLabel && (
            <div
              className={cn(
                'text-sm text-[var(--muted-foreground)]',
                'px-4 py-3 bg-[var(--muted)] rounded-md text-center'
              )}
            >
              {resultsLabel}
            </div>
          )}

          {/* Search Input */}
          <div className="relative flex items-center">
            <Search
              size={18}
              className="absolute left-4 text-[var(--muted-foreground)] pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              className={cn(
                'w-full py-3 px-4 pl-[calc(1rem+18px+0.5rem)] pr-[calc(1rem+24px)]',
                'text-base border border-[var(--border)] rounded-lg',
                'bg-[var(--input)] text-[var(--foreground)]',
                'transition-all duration-200',
                'placeholder:text-[var(--muted-foreground)]',
                'focus:outline-none focus:border-[var(--primary)] focus:ring-[3px] focus:ring-[var(--primary)]/10',
                'max-[480px]:text-base' // Prevent iOS zoom
              )}
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchTerm && (
              <button
                className={cn(
                  'absolute right-4',
                  'bg-transparent border-none rounded-full',
                  'w-5 h-5 flex items-center justify-center',
                  'cursor-pointer text-[var(--muted-foreground)]',
                  'transition-all duration-200',
                  'hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
                  'active:scale-90'
                )}
                onClick={handleClearSearch}
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Sort Options */}
          {sortOptions.length > 0 && (
            <div className="flex flex-col gap-3">
              <label
                className={cn(
                  'text-sm font-medium text-[var(--muted-foreground)]',
                  'uppercase tracking-wide'
                )}
              >
                Sort by
              </label>
              <div className="flex flex-col gap-2">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    className={cn(
                      'flex items-center gap-3 p-4',
                      'bg-[var(--card)] border border-[var(--border)] rounded-md',
                      'cursor-pointer text-base text-[var(--foreground)] text-left',
                      'transition-all duration-200',
                      'hover:bg-[var(--muted)] hover:border-[var(--primary)]',
                      sortOrder === option.value && [
                        'bg-[var(--primary)] border-[var(--primary)] text-white',
                        'hover:bg-[var(--primary)] hover:brightness-110',
                      ]
                    )}
                    onClick={() => onSortChange(option.value)}
                  >
                    {option.icon && (
                      <span className={cn('flex-shrink-0', sortOrder === option.value && 'text-white')}>
                        {option.icon}
                      </span>
                    )}
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Content */}
          {children}
        </div>
      </aside>
    </>
  );
};

export default FilterPanel;
