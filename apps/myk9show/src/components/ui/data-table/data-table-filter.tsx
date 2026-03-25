import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDataTableContext } from './data-table-toolbar';

interface DataTableFilterProps {
  column: string;
  title: string;
  options: Array<{ label: string; value: string }>;
}

export function DataTableFilter({ column: columnId, title, options }: DataTableFilterProps) {
  const table = useDataTableContext<unknown>();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const column = table.getColumn(columnId);
  if (!column) return null;

  const filterValue = (column.getFilterValue() as string[] | undefined) ?? [];

  const toggleOption = (value: string) => {
    const next = filterValue.includes(value)
      ? filterValue.filter(v => v !== value)
      : [...filterValue, value];
    column.setFilterValue(next.length > 0 ? next : undefined);
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(!open)}>
        {title}
        {filterValue.length > 0 && (
          <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-primary">
            {filterValue.length}
          </span>
        )}
        <ChevronDown className="ml-1 h-3 w-3" />
      </Button>
      {filterValue.length > 0 && (
        <button
          type="button"
          className="ml-1 text-muted-foreground hover:text-foreground"
          onClick={() => column.setFilterValue(undefined)}
          aria-label={`Clear ${title} filter`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
                filterValue.includes(option.value) && 'bg-accent/50'
              )}
              onClick={() => toggleOption(option.value)}
            >
              <Check
                className={cn(
                  'h-3 w-3',
                  filterValue.includes(option.value) ? 'opacity-100' : 'opacity-0'
                )}
              />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
