import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDataTableContext } from './data-table-toolbar';

interface DataTableSearchProps {
  placeholder?: string;
  debounceMs?: number;
}

export function DataTableSearch({
  placeholder = 'Search...',
  debounceMs = 300,
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
    <div className="relative max-w-sm">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        className="h-8 pl-8 pr-8 text-sm"
      />
      {value && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setValue('');
            applyFilter('');
          }}
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
