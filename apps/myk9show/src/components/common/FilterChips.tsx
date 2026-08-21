import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterDefinition {
  key: string;
  label: string;
  options: FilterOption[];
}

interface FilterChipsProps {
  filters: FilterDefinition[];
  values: Record<string, string>;
  onChange: (key: string, value: string | null) => void;
  className?: string;
}

export function FilterChips({ filters, values, onChange, className }: FilterChipsProps) {
  return (
    <div data-testid="filter-chips" className={cn('flex flex-wrap gap-2', className)}>
      {filters.map(filter => {
        const activeValue = values[filter.key];
        const activeOption = filter.options.find(o => o.value === activeValue);
        const chipTone = activeValue
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-card text-foreground shadow-card hover:shadow-card-hover';

        return (
          // The clear control is a SIBLING of the trigger, not a child of it. It
          // used to be a bare <X> SVG carrying an onClick inside the trigger, so
          // it took no focus and Enter on the chip opened the menu instead — at
          // >=640px that left a keyboard or screen-reader user with no way at all
          // to remove an applied filter. The menu now also carries an "All …"
          // reset, which is what those users actually reach.
          <div key={filter.key} className={cn('inline-flex items-center rounded-full', chipTone)}>
            <DropdownMenu>
              <DropdownMenuTrigger
                nativeButton
                className={cn(
                  'h-11 rounded-full pl-4 text-sm inline-flex items-center gap-1 transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activeValue ? 'pr-1' : 'pr-4'
                )}
              >
                {activeOption ? activeOption.label : filter.label}
                {!activeValue && <ChevronDown className="h-3.5 w-3.5 ml-0.5" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px] rounded-xl py-1">
                {filter.options.length === 0 ? (
                  // Without this the menu opened as an empty 160x10px box — a dead
                  // end that reads as a broken control rather than as absent data.
                  <p className="px-3.5 py-2 text-sm text-muted-foreground">
                    No {filter.label.toLowerCase()} options yet
                  </p>
                ) : (
                  <>
                    {activeValue && (
                      <DropdownMenuItem
                        className="px-3.5 py-2 text-sm rounded-none"
                        onClick={() => onChange(filter.key, null)}
                      >
                        All {filter.label.toLowerCase()}
                      </DropdownMenuItem>
                    )}
                    {filter.options.map(option => (
                      <DropdownMenuItem
                        key={option.value}
                        className={cn(
                          'px-3.5 py-2 text-sm rounded-none',
                          activeValue === option.value && 'bg-accent font-medium'
                        )}
                        onClick={() => onChange(filter.key, option.value)}
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {activeValue && (
              <button
                type="button"
                aria-label={`Clear ${filter.label.toLowerCase()} filter`}
                onClick={() => onChange(filter.key, null)}
                className="h-11 w-11 inline-flex items-center justify-center rounded-full transition-colors hover:bg-primary-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export type { FilterDefinition, FilterOption };
