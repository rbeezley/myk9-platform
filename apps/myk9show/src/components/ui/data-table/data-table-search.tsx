import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDataTableContext } from './data-table-toolbar';

interface DataTableSearchProps {
  placeholder?: string;
  debounceMs?: number;
  ariaLabel?: string;
}

export function DataTableSearch({
  placeholder = 'Search...',
  debounceMs = 300,
  ariaLabel = 'Search table',
}: DataTableSearchProps) {
  const table = useDataTableContext<unknown>();
  const currentFilter = (table.getState().globalFilter as string) ?? '';
  const [value, setValue] = useState(currentFilter);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync when external code resets the filter (e.g. "Clear filters" button)
  useEffect(() => {
    setValue(currentFilter);
  }, [currentFilter]);

  const applyFilter = useCallback(
    (searchValue: string) => {
      table.setGlobalFilter(searchValue || undefined);
    },
    [table]
  );

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => applyFilter(value), debounceMs);
    return () => clearTimeout(timerRef.current);
  }, [value, debounceMs, applyFilter]);

  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        className="h-11 pl-9 pr-11 text-sm"
      />
      {value && (
        <button
          type="button"
          className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            setValue('');
            applyFilter('');
          }}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
