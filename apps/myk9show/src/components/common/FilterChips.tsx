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

        return (
          <DropdownMenu key={filter.key}>
            <DropdownMenuTrigger
              nativeButton
              className={cn(
                'h-8 rounded-full px-3 text-sm inline-flex items-center gap-1 transition-all',
                activeValue
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card text-foreground shadow-card hover:shadow-card-hover'
              )}
            >
              {activeOption ? activeOption.label : filter.label}
              {activeValue ? (
                <X
                  className="h-3.5 w-3.5 ml-0.5"
                  onClick={e => {
                    e.stopPropagation();
                    onChange(filter.key, null);
                  }}
                />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-0.5" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[160px] rounded-xl py-1">
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
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}

export type { FilterDefinition, FilterOption };
