import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDataTableContext } from './data-table-toolbar';

export function DataTableColumnToggle() {
  const table = useDataTableContext<unknown>();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus first item when opening
  useEffect(() => {
    if (open) {
      firstItemRef.current?.focus();
    }
  }, [open]);

  const handleDropdownKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }, []);

  const toggleableColumns = table.getAllColumns().filter(col => col.getCanHide());

  return (
    <div className="relative ml-auto" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={() => setOpen(!open)}
        aria-label="Toggle columns"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Columns3 className="h-3.5 w-3.5 mr-1" />
        Columns
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Toggle column visibility"
          className="absolute top-full right-0 z-50 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md"
          onKeyDown={handleDropdownKeyDown}
        >
          {toggleableColumns.map((column, index) => (
            <label
              key={column.id}
              ref={index === 0 ? firstItemRef : undefined}
              tabIndex={0}
              className={cn(
                'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
                !column.getIsVisible() && 'opacity-50'
              )}
            >
              <input
                type="checkbox"
                checked={column.getIsVisible()}
                onChange={column.getToggleVisibilityHandler()}
              />
              {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
